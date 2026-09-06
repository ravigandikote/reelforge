import { unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { ffmpeg, runFfmpeg } from './ffmpeg.js'
import { ensureDir } from './paths.js'

export const THUMB_WIDTH = 640

/** Grid thumbnail for a photo. `rotate()` applies the EXIF orientation. */
export async function imageThumbnail(source: string, destination: string): Promise<void> {
  await ensureDir(path.dirname(destination))
  await sharp(source)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destination)
}

/**
 * Poster frame for a video. Seeks to 10% in — frame zero on phone footage is
 * usually a blurred pan or a black lead-in.
 */
export async function videoThumbnail(
  source: string,
  destination: string,
  durationSec: number | null,
): Promise<void> {
  await ensureDir(path.dirname(destination))
  const seek = durationSec && durationSec > 1 ? Math.min(durationSec * 0.1, durationSec - 0.1) : 0
  const framePath = `${destination}.frame.png`

  await runFfmpeg(
    ffmpeg(source)
      .seekInput(seek)
      .frames(1)
      .outputOptions('-q:v', '2')
      .output(framePath),
  )

  try {
    await sharp(framePath)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(destination)
  } finally {
    await unlink(framePath).catch(() => {})
  }
}
