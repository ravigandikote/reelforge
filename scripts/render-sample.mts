#!/usr/bin/env tsx
/**
 * Renders the hand-written sample EDL to a real MP4 for each format, so the
 * compositions can be checked without a project, an API key, or the queue.
 *
 *   pnpm sample                  # every format
 *   pnpm sample portrait_9x16_30 # just one
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { RENDER_FORMATS, RENDER_TARGETS, type RenderTarget } from '@reelforge/shared'
import { repoRoot } from '@reelforge/shared/paths'
import { ffmpegPath } from '@reelforge/media'
import { renderFilm } from '@reelforge/video/render'
import { sampleCues, samplePropsFor } from '@reelforge/video/sample'

const run = promisify(execFile)

const root = repoRoot()
const fixtures = path.join(root, 'tests/fixtures/album')
const stage = path.join(root, 'media/.sample')
const outDir = path.join(root, 'renders/sample')

const FILES = [
  'stage-wide.jpg',
  'lake-portrait.jpg',
  'bonfire-square.jpg',
  'performance-landscape.mp4',
]

const args = process.argv.slice(2)
const withVoice = args.includes('--voice')
const requested = args.filter((arg): arg is RenderTarget =>
  RENDER_TARGETS.includes(arg as RenderTarget),
)
const targets = requested.length > 0 ? requested : [...RENDER_TARGETS]

// The sample media has to live inside the public dir for staticFile() to see it.
await mkdir(stage, { recursive: true })
await mkdir(outDir, { recursive: true })
for (const file of FILES) {
  await copyFile(path.join(fixtures, file), path.join(stage, file))
}

// --voice stages a synthetic narration track: one tone burst per caption,
// timed to that caption's words. It is not speech, but it exercises the audio
// path and the word-by-word highlighting without an ElevenLabs key.
let voiceSrc: string | null = null
if (withVoice) {
  const cues = sampleCues()
  const total = 30
  const bursts = cues
    .map((cue, index) => {
      const duration = (cue.endSec - cue.startSec).toFixed(3)
      const delay = Math.round(cue.startSec * 1000)
      return { index, duration, delay }
    })
  const inputs = bursts.flatMap((burst) => [
    '-f', 'lavfi', '-i', `sine=frequency=${190 + burst.index * 12}:duration=${burst.duration}`,
  ])
  const filters = bursts
    .map((burst, i) => `[${i}:a]tremolo=f=5.5:d=0.7,volume=0.6,adelay=${burst.delay}|${burst.delay}[v${i}]`)
    .join(';')
  const mix = `${bursts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${bursts.length}:normalize=0,apad,atrim=0:${total}[out]`
  const voicePath = path.join(stage, 'voice.m4a')

  await run(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', `${filters};${mix}`,
    '-map', '[out]', '-c:a', 'aac', '-b:a', '160k', voicePath,
  ])
  voiceSrc = '.sample/voice.m4a'
  process.stdout.write(`Staged a synthetic narration track (${bursts.length} bursts)\n`)
}

for (const target of targets) {
  const format = RENDER_FORMATS[target]
  const outputPath = path.join(outDir, `${target}.mp4`)
  const started = Date.now()
  let lastLogged = -1

  process.stdout.write(`\n${format.label} (${format.width}x${format.height})\n`)

  const { durationInFrames } = await renderFilm({
    props: samplePropsFor(target, { voiceSrc, withCues: withVoice }),
    outputPath,
    onProgress: (progress) => {
      const percent = Math.round(progress * 100)
      if (percent >= lastLogged + 10) {
        lastLogged = percent
        process.stdout.write(`  ${percent}%\n`)
      }
    },
  })

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  process.stdout.write(
    `  → ${path.relative(root, outputPath)} (${durationInFrames} frames, ${seconds}s)\n`,
  )
}
