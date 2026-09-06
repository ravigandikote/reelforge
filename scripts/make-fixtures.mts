#!/usr/bin/env tsx
/**
 * Generates the fixture album used by the ingest tests: a few synthetic stills
 * and two short clips (one with a 90° rotation flag, like phone footage).
 * Committed to tests/fixtures/album so the suite needs no real media.
 *
 *   pnpm fixtures
 */
import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import archiver from 'archiver'
import { ffmpegPath } from '@reelforge/media'
import { repoRoot } from '@reelforge/shared/paths'

const root = repoRoot()
const out = path.join(root, 'tests/fixtures/album')

function run(args: string[]) {
  const res = spawnSync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
    stdio: 'inherit',
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

// Stills: landscape, portrait, square.
const stills: Array<[string, string]> = [
  ['stage-wide.jpg', 'gradients=s=1920x1080:n=3'],
  ['lake-portrait.jpg', 'gradients=s=1080x1920:n=2'],
  ['bonfire-square.jpg', 'gradients=s=1200x1200:n=4'],
]
for (const [name, filter] of stills) {
  run(['-f', 'lavfi', '-i', `${filter}:d=1`, '-frames:v', '1', '-q:v', '6', path.join(out, name)])
}

// Landscape clip with audio, 6s.
run([
  '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25:d=6',
  '-f', 'lavfi', '-i', 'sine=frequency=220:duration=6',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '64k', '-shortest',
  path.join(out, 'performance-landscape.mp4'),
])

// Portrait-by-rotation clip, silent, 4s: stored 1280x720 with a 90° display
// matrix, which is how most phone video arrives. FFmpeg only writes that matrix
// on a remux, so this is an encode followed by a copy with -display_rotation.
const flat = path.join(out, '.phone-flat.mp4')
run([
  '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=25:d=4',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '34', '-pix_fmt', 'yuv420p',
  flat,
])
run(['-display_rotation', '90', '-i', flat, '-c', 'copy', path.join(out, 'phone-rotated.mp4')])
await rm(flat, { force: true })

// An archive of the same album plus the junk a real Mac zip carries, so the
// ingest tests cover extraction and filtering.
const junk = path.join(out, '.junk')
await mkdir(junk, { recursive: true })
await writeFile(path.join(junk, 'notes.txt'), 'Programme notes — not media.\n')

await new Promise<void>((resolve, reject) => {
  const output = createWriteStream(path.join(root, 'tests/fixtures/album.zip'))
  const archive = archiver('zip', { zlib: { level: 6 } })
  output.on('close', () => resolve())
  archive.on('error', reject)
  archive.pipe(output)
  for (const [name] of stills) archive.file(path.join(out, name), { name: `album/${name}` })
  archive.file(path.join(out, 'performance-landscape.mp4'), { name: 'album/performance-landscape.mp4' })
  archive.file(path.join(out, 'phone-rotated.mp4'), { name: 'album/clips/phone-rotated.mp4' })
  archive.file(path.join(junk, 'notes.txt'), { name: 'album/notes.txt' })
  archive.append('mac metadata', { name: '__MACOSX/album/._stage-wide.jpg' })
  archive.append('', { name: 'album/.DS_Store' })
  void archive.finalize()
})
await rm(junk, { recursive: true, force: true })

console.log(`Fixtures written to ${path.relative(root, out)} (+ album.zip)`)
