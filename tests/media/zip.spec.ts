import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractZip, probeFile } from '@reelforge/media'

const archive = path.resolve(__dirname, '../fixtures/album.zip')
let workDir: string

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'reelforge-zip-'))
})
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('extractZip', () => {
  it('pulls out every supported file, including nested folders', async () => {
    const entries = await extractZip(archive, workDir)
    const names = entries.map((e) => path.basename(e.filePath)).sort()

    expect(names).toEqual([
      'bonfire-square.jpg',
      'lake-portrait.jpg',
      'performance-landscape.mp4',
      'phone-rotated.mp4',
      'stage-wide.jpg',
    ])
    // The clip lives in album/clips/ inside the archive but lands flat on disk.
    expect(entries.some((e) => e.entryName.includes('clips/'))).toBe(true)
  })

  it('skips Mac metadata, dotfiles and unsupported types', async () => {
    const entries = await extractZip(archive, workDir)
    const all = entries.map((e) => e.entryName).join(' ')

    expect(all).not.toContain('__MACOSX')
    expect(all).not.toContain('.DS_Store')
    expect(all).not.toContain('notes.txt')
  })

  it('writes files that are actually readable afterwards', async () => {
    const entries = await extractZip(archive, workDir)
    const clip = entries.find((e) => e.filePath.endsWith('performance-landscape.mp4'))
    expect(clip).toBeDefined()

    const probed = await probeFile(clip!.filePath)
    expect(probed.kind).toBe('video')
    expect(probed.durationSec).toBeCloseTo(6, 0)
  })
})
