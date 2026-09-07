import path from 'node:path'
import { ffmpeg, ffprobeAsync, runFfmpeg } from './ffmpeg.js'
import { ensureDir } from './paths.js'

/** Narration sits at broadcast level: -16 LUFS with 1.5 dB of true-peak headroom. */
const LOUDNORM_VOICE = 'loudnorm=I=-16:TP=-1.5:LRA=11'

/** The bed sits a good 8 LU below the voice before any ducking is applied. */
const LOUDNORM_MUSIC = 'loudnorm=I=-24:TP=-2:LRA=11'

export interface VoiceClip {
  filePath: string
  /** Where the line starts on the film's timeline. */
  offsetSec: number
}

/** Seconds of audio in a file, or 0 if it has none. */
export async function audioDuration(filePath: string): Promise<number> {
  const data = await ffprobeAsync(filePath)
  const stream = data.streams.find((s) => s.codec_type === 'audio')
  return Number(stream?.duration ?? data.format?.duration ?? 0) || 0
}

/**
 * Lays each narration line at its own offset on one silent bed the length of the
 * film. Lines are placed, never concatenated: the EDL decides when each is
 * spoken, and concatenation would let a long line push everything after it out
 * of sync with the picture.
 */
export async function buildVoiceTrack(
  clips: VoiceClip[],
  totalSec: number,
  outputPath: string,
): Promise<void> {
  await ensureDir(path.dirname(outputPath))

  if (clips.length === 0) {
    await runFfmpeg(
      ffmpeg()
        .input('anullsrc=channel_layout=stereo:sample_rate=48000')
        .inputFormat('lavfi')
        .duration(totalSec)
        .audioCodec('aac')
        .output(outputPath),
    )
    return
  }

  const command = ffmpeg()
  for (const clip of clips) command.input(clip.filePath)

  const delays = clips.map((clip, index) => {
    const ms = Math.max(0, Math.round(clip.offsetSec * 1000))
    // Each line is normalised to broadcast level before it is placed. TTS
    // output level varies by voice and by line, and the ducking downstream
    // keys off this track — an unpredictable key means unpredictable ducking.
    return `[${index}:a]aresample=48000,${LOUDNORM_VOICE},adelay=${ms}|${ms}[v${index}]`
  })
  const mixInputs = clips.map((_, index) => `[v${index}]`).join('')

  await runFfmpeg(
    command
      .complexFilter([
        ...delays,
        // normalize=0 keeps each line at the level it was generated; the lines
        // do not overlap, so there is nothing to normalise against.
        `${mixInputs}amix=inputs=${clips.length}:normalize=0,apad,atrim=0:${totalSec.toFixed(3)}[out]`,
      ])
      .outputOptions('-map', '[out]', '-ac', '2', '-ar', '48000')
      .audioCodec('aac')
      .audioBitrate('192k')
      .output(outputPath),
  )
}

export interface DuckOptions {
  voicePath: string
  musicPath: string
  totalSec: number
  outputPath: string
  /** Music level before ducking, 0..1. */
  musicGain?: number
}

/**
 * Mixes music under the narration with sidechain compression: the voice itself
 * drives the gain reduction, so the bed drops when someone speaks and comes back
 * up in the gaps. A fixed low level would either bury the music or fight the
 * voice, depending on the track.
 */
export async function duckMusicUnderVoice(options: DuckOptions): Promise<void> {
  const { voicePath, musicPath, totalSec, outputPath } = options
  const gain = options.musicGain ?? 0.7
  await ensureDir(path.dirname(outputPath))

  await runFfmpeg(
    ffmpeg()
      .input(voicePath)
      .input(musicPath)
      // Short tracks are looped rather than cut off mid-film.
      .inputOptions('-stream_loop', '-1')
      .complexFilter([
        `[0:a]aresample=48000,apad,atrim=0:${totalSec.toFixed(3)}[voice]`,
        // Normalising the bed first means the same settings duck any track by
        // the same amount, whether it arrived hot or quiet.
        `[1:a]aresample=48000,atrim=0:${totalSec.toFixed(3)},${LOUDNORM_MUSIC},volume=${gain}[bed]`,
        '[voice]asplit=2[voicemix][key]',
        // Speech pulls the bed down by roughly 10 dB, with a slow release so it
        // does not pump between words.
        '[bed][key]sidechaincompress=threshold=0.05:ratio=8:attack=15:release=450:detection=rms:makeup=1[ducked]',
        '[voicemix][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.97[out]',
      ])
      .outputOptions('-map', '[out]', '-ac', '2', '-ar', '48000')
      .audioCodec('aac')
      .audioBitrate('192k')
      .output(outputPath),
  )
}

/** Music with no narration: just trimmed, looped and levelled. */
export async function musicOnlyTrack(
  musicPath: string,
  totalSec: number,
  outputPath: string,
  gain = 1,
): Promise<void> {
  await ensureDir(path.dirname(outputPath))
  await runFfmpeg(
    ffmpeg()
      .input(musicPath)
      .inputOptions('-stream_loop', '-1')
      .audioFilters([
        `atrim=0:${totalSec.toFixed(3)}`,
        'aresample=48000',
        LOUDNORM_MUSIC,
        `volume=${gain}`,
      ])
      .audioCodec('aac')
      .audioBitrate('192k')
      .output(outputPath),
  )
}
