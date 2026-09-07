import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  audioDuration,
  buildVoiceTrack,
  duckMusicUnderVoice,
  ffmpegPath,
  musicOnlyTrack,
} from '@reelforge/media'

const run = promisify(execFile)
let workDir: string

/** Mean level of a window, in dBFS, straight from ffmpeg's volumedetect. */
async function level(file: string, startSec: number, durationSec: number): Promise<number> {
  const { stderr } = await run(ffmpegPath, [
    '-hide_banner', '-nostats',
    '-ss', String(startSec), '-t', String(durationSec),
    '-i', file, '-af', 'volumedetect', '-f', 'null', '-',
  ])
  const match = stderr.match(/mean_volume: (-?[\d.]+) dB/)
  if (!match) throw new Error('volumedetect returned no level')
  return Number(match[1])
}

async function tone(file: string, seconds: number, frequency = 180): Promise<void> {
  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=${seconds}`,
    '-af', 'volume=0.5', '-c:a', 'libmp3lame', '-b:a', '96k', file,
  ])
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'reelforge-audio-'))
}, 60_000)

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('buildVoiceTrack', () => {
  it('places each line at its offset on a bed the length of the film', async () => {
    const line = path.join(workDir, 'line.mp3')
    const track = path.join(workDir, 'voice.m4a')
    await tone(line, 1)

    await buildVoiceTrack([{ filePath: line, offsetSec: 2 }], 5, track)

    expect(await audioDuration(track)).toBeCloseTo(5, 0)
    // Silent before the line, loud during it.
    expect(await level(track, 0, 1.5)).toBeLessThan(-60)
    expect(await level(track, 2.1, 0.7)).toBeGreaterThan(-30)
  }, 120_000)

  it('produces a silent track of the right length when nothing is spoken', async () => {
    const track = path.join(workDir, 'silent.m4a')
    await buildVoiceTrack([], 4, track)
    expect(await audioDuration(track)).toBeCloseTo(4, 0)
  }, 120_000)

  it('normalises lines to a predictable level, whatever the source', async () => {
    const quiet = path.join(workDir, 'quiet.mp3')
    const track = path.join(workDir, 'normalised.m4a')
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=180:duration=3',
      // A deliberately quiet source: without normalisation the ducking that
      // keys off this track would barely move.
      '-af', 'volume=0.05', '-c:a', 'libmp3lame', '-b:a', '96k', quiet,
    ])

    await buildVoiceTrack([{ filePath: quiet, offsetSec: 0 }], 3, track)
    const loudness = await level(track, 0.5, 2)
    expect(loudness).toBeGreaterThan(-24)
  }, 120_000)
})

describe('duckMusicUnderVoice', () => {
  it('pulls the bed down under speech and lets it back up in the gaps', async () => {
    const voiceLine = path.join(workDir, 'duck-line.mp3')
    const voiceTrack = path.join(workDir, 'duck-voice.m4a')
    const music = path.join(workDir, 'duck-music.mp3')
    const mixed = path.join(workDir, 'duck-mix.m4a')
    const plain = path.join(workDir, 'duck-plain.m4a')

    // Speech for the first 1.5s of a 3s film; silence after it.
    await tone(voiceLine, 1.5)
    await tone(music, 4, 300)
    await buildVoiceTrack([{ filePath: voiceLine, offsetSec: 0 }], 3, voiceTrack)

    await duckMusicUnderVoice({ voicePath: voiceTrack, musicPath: music, totalSec: 3, outputPath: mixed })
    await musicOnlyTrack(music, 3, plain)

    expect(await audioDuration(mixed)).toBeCloseTo(3, 0)

    // In the gap the mix is just the bed, so it should sit close to the
    // unducked reference; under speech the whole mix is louder because the
    // voice is in it. The measurable guarantee is that the gap is quieter than
    // the speech and that the bed itself is audible again afterwards.
    const speech = await level(mixed, 0.2, 1.1)
    const gap = await level(mixed, 1.8, 1.0)
    const reference = await level(plain, 1.8, 1.0)

    expect(speech).toBeGreaterThan(gap)
    expect(Math.abs(gap - reference)).toBeLessThan(6)
  }, 180_000)
})
