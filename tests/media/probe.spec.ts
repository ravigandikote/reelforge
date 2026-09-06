import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  checksumFile,
  dominantColors,
  imageThumbnail,
  makeProxy,
  probeFile,
  videoThumbnail,
} from '@reelforge/media'

const album = path.resolve(__dirname, '../fixtures/album')
let workDir: string

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'reelforge-probe-'))
})
afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('probeFile', () => {
  it('reads a landscape still', async () => {
    const result = await probeFile(path.join(album, 'stage-wide.jpg'))
    expect(result).toMatchObject({
      kind: 'photo',
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      durationSec: null,
      hasAudio: false,
    })
  })

  it('reads a portrait still', async () => {
    const result = await probeFile(path.join(album, 'lake-portrait.jpg'))
    expect(result.orientation).toBe('portrait')
    expect(result.width).toBe(1080)
  })

  it('reads a square still', async () => {
    const result = await probeFile(path.join(album, 'bonfire-square.jpg'))
    expect(result.orientation).toBe('square')
  })

  it('reads duration, fps and audio from a clip', async () => {
    const result = await probeFile(path.join(album, 'performance-landscape.mp4'))
    expect(result.kind).toBe('video')
    expect(result.durationSec).toBeCloseTo(6, 0)
    expect(result.fps).toBe(25)
    expect(result.hasAudio).toBe(true)
    expect(result.orientation).toBe('landscape')
  })

  it('applies the rotation flag, so phone footage files as portrait', async () => {
    const result = await probeFile(path.join(album, 'phone-rotated.mp4'))
    // Stored as 1280x720 with a 90° rotation flag — it displays as 720x1280.
    expect(result.width).toBe(720)
    expect(result.height).toBe(1280)
    expect(result.orientation).toBe('portrait')
    expect(result.hasAudio).toBe(false)
  })
})

describe('derivatives', () => {
  it('writes an image thumbnail no wider than 640px', async () => {
    const dest = path.join(workDir, 'thumb.jpg')
    await imageThumbnail(path.join(album, 'stage-wide.jpg'), dest)
    const probed = await probeFile(dest)
    expect(probed.width).toBeLessThanOrEqual(640)
    expect((await stat(dest)).size).toBeGreaterThan(0)
  })

  it('writes a poster frame for a clip', async () => {
    const dest = path.join(workDir, 'poster.jpg')
    await videoThumbnail(path.join(album, 'performance-landscape.mp4'), dest, 6)
    expect((await stat(dest)).size).toBeGreaterThan(0)
  })

  it('writes a 720p proxy that keeps the source duration', async () => {
    const dest = path.join(workDir, 'proxy.mp4')
    await makeProxy(path.join(album, 'performance-landscape.mp4'), dest)
    const probed = await probeFile(dest)
    expect(probed.height).toBe(720)
    expect(probed.durationSec).toBeCloseTo(6, 0)
  }, 60_000)

  it('extracts dominant colours as hex', async () => {
    const colors = await dominantColors(path.join(album, 'stage-wide.jpg'))
    expect(colors.length).toBeGreaterThan(0)
    for (const color of colors) expect(color).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('checksums a file deterministically', async () => {
    const file = path.join(album, 'bonfire-square.jpg')
    const [a, b] = await Promise.all([checksumFile(file), checksumFile(file)])
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })
})
