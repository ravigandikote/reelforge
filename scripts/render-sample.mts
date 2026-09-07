#!/usr/bin/env tsx
/**
 * Renders the hand-written sample EDL to a real MP4 for each format, so the
 * compositions can be checked without a project, an API key, or the queue.
 *
 *   pnpm sample                  # every format
 *   pnpm sample portrait_9x16_30 # just one
 */
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { RENDER_FORMATS, RENDER_TARGETS, type RenderTarget } from '@reelforge/shared'
import { repoRoot } from '@reelforge/shared/paths'
import { renderFilm } from '@reelforge/video/render'
import { samplePropsFor } from '@reelforge/video/sample'

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

const requested = process.argv.slice(2).filter((arg): arg is RenderTarget =>
  RENDER_TARGETS.includes(arg as RenderTarget),
)
const targets = requested.length > 0 ? requested : [...RENDER_TARGETS]

// The sample media has to live inside the public dir for staticFile() to see it.
await mkdir(stage, { recursive: true })
await mkdir(outDir, { recursive: true })
for (const file of FILES) {
  await copyFile(path.join(fixtures, file), path.join(stage, file))
}

for (const target of targets) {
  const format = RENDER_FORMATS[target]
  const outputPath = path.join(outDir, `${target}.mp4`)
  const started = Date.now()
  let lastLogged = -1

  process.stdout.write(`\n${format.label} (${format.width}x${format.height})\n`)

  const { durationInFrames } = await renderFilm({
    props: samplePropsFor(target),
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
