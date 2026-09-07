import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@reelforge/db'
import {
  audioDuration,
  buildVoiceTrack,
  duckMusicUnderVoice,
  ensureDir,
  musicOnlyTrack,
  rendersDir,
  toAbsolute,
  toRelative,
  type VoiceClip,
} from '@reelforge/media'
import {
  MIN_CAPTION_SEC,
  buildCues,
  cuesFromSegments,
  toSrt,
  toVtt,
  ttsJobSchema,
  type TimedWord,
} from '@reelforge/shared'
import { getEnv } from '@reelforge/shared/env'
import { characterCount, speak } from '@reelforge/tts'
import { markStatus, report } from '../progress.js'

/**
 * Turns one planned cut into an audio track and subtitles: narration per
 * segment, word timings from the provider (no second alignment pass), captions
 * grouped into readable phrases, and music ducked under the voice.
 *
 * The artefacts belong to the EDL rather than to a render, so re-rendering the
 * same cut — a different codec, a retry — does not pay for the voiceover twice.
 */
export async function runTts(raw: unknown): Promise<void> {
  const { jobId, edlId } = ttsJobSchema.parse(raw)

  await markStatus(jobId, 'running')

  try {
    const edl = await prisma.edl.findUnique({
      where: { id: edlId },
      include: { segments: { orderBy: { index: 'asc' } }, project: { include: { musicTrack: true } } },
    })
    if (!edl) throw new Error('That cut no longer exists')

    const totalSec = edl.actualSeconds
    const outDir = await ensureDir(path.join(rendersDir(), edlId))
    const project = edl.project

    let words: TimedWord[] = []
    let voicePath: string | null = null
    let voiceSeconds = 0

    if (project.voiceEnabled) {
      const lines = edl.segments.filter((segment) => segment.voiceoverText?.trim())
      if (lines.length === 0) {
        await report(jobId, 5, 'No segment carries narration — captions will be timed from the edit', {
          level: 'warn',
        })
      }

      const characters = characterCount(lines.map((line) => line.voiceoverText ?? ''))
      const ceiling = getEnv().TTS_MAX_CHARS_PER_JOB
      if (characters > ceiling) {
        throw new Error(
          `This narration is ${characters} characters, over the ${ceiling} limit (TTS_MAX_CHARS_PER_JOB)`,
        )
      }

      await report(jobId, 5, `Speaking ${lines.length} line(s), ${characters} characters…`)

      const clips: VoiceClip[] = []
      const voiceDir = await ensureDir(path.join(outDir, 'voice'))

      for (const [index, segment] of lines.entries()) {
        const progress = 5 + ((index + 1) / lines.length) * 55
        const result = await speak({
          text: segment.voiceoverText!.trim(),
          offsetSec: segment.startSec,
          segmentIndex: segment.index,
          voiceId: project.voiceId ?? undefined,
        })

        const clipPath = path.join(voiceDir, `${String(segment.index).padStart(3, '0')}.mp3`)
        await writeFile(clipPath, result.audio)
        clips.push({ filePath: clipPath, offsetSec: segment.startSec })
        words = [...words, ...result.words]
        voiceSeconds += result.durationSec

        // Narration that outruns its shot is the one failure the edit cannot
        // absorb by itself — the picture cuts away mid-sentence.
        const room = segment.endSec - segment.startSec
        if (result.durationSec > room + 0.15) {
          await report(
            jobId,
            progress,
            `Segment ${segment.index + 1}: the line takes ${result.durationSec.toFixed(1)}s but the shot is ${room.toFixed(1)}s — shorten the line or re-plan with fewer shots`,
            { level: 'warn' },
          )
        } else {
          await report(jobId, progress, `Segment ${segment.index + 1} spoken (${result.durationSec.toFixed(1)}s)`)
        }
      }

      if (clips.length > 0) {
        await report(jobId, 65, 'Laying the narration onto the timeline…')
        const trackPath = path.join(outDir, 'voice.m4a')
        await buildVoiceTrack(clips, totalSec, trackPath)
        voicePath = toRelative(trackPath)
      }
    }

    // Music: ducked under the voice when there is one, levelled on its own when
    // there is not.
    let musicPath: string | null = null
    if (project.musicTrack) {
      await report(jobId, 75, `Mixing "${project.musicTrack.title}" under the narration…`)
      const source = toAbsolute(project.musicTrack.path)
      const mixPath = path.join(outDir, 'audio.m4a')

      if (voicePath) {
        await duckMusicUnderVoice({
          voicePath: toAbsolute(voicePath),
          musicPath: source,
          totalSec,
          outputPath: mixPath,
        })
      } else {
        await musicOnlyTrack(source, totalSec, mixPath)
      }
      musicPath = toRelative(mixPath)
    }

    await report(jobId, 85, 'Writing captions…')

    const cues =
      words.length > 0
        ? buildCues(words, { filmEndSec: totalSec, minSeconds: MIN_CAPTION_SEC })
        : cuesFromSegments(edl.segments)

    const srtPath = path.join(outDir, 'captions.srt')
    const vttPath = path.join(outDir, 'captions.vtt')
    await writeFile(srtPath, toSrt(cues), 'utf8')
    await writeFile(vttPath, toVtt(cues), 'utf8')

    // Word timings are stored per segment so the renderer can highlight the
    // word being spoken without re-reading the subtitle files.
    await prisma.$transaction([
      prisma.captionWord.deleteMany({
        where: { segment: { edlId } },
      }),
      ...words.map((word) => {
        const segment = edl.segments.find((candidate) => candidate.index === word.segmentIndex)
        return prisma.captionWord.create({
          data: {
            segmentId: segment!.id,
            word: word.word,
            startSec: word.startSec,
            endSec: word.endSec,
          },
        })
      }),
      prisma.edl.update({
        where: { id: edlId },
        data: {
          voicePath,
          musicPath,
          srtPath: toRelative(srtPath),
          vttPath: toRelative(vttPath),
          voiceSeconds: voiceSeconds || null,
        },
      }),
    ])

    const actualVoice = voicePath ? await audioDuration(toAbsolute(voicePath)) : 0
    const summary = [
      `${cues.length} caption cue(s)`,
      words.length ? `${words.length} words aligned` : 'timed from the edit',
      voicePath ? `${actualVoice.toFixed(1)}s of narration` : null,
      musicPath ? 'music ducked' : null,
    ]
      .filter(Boolean)
      .join(' · ')

    await report(jobId, 100, summary, { data: { cues: cues.length, words: words.length } })
    await markStatus(jobId, 'succeeded')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await report(jobId, 100, message, { level: 'error' })
    await markStatus(jobId, 'failed', { error: message })
    throw err
  }
}
