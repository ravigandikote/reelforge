import { unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { ffmpeg, runFfmpeg } from './ffmpeg.js'

/**
 * Claude downscales anything over 1568px on the long edge before billing it, and
 * a description/tagging pass does not need more detail than this. Smaller images
 * mean fewer tokens per asset, which is the whole cost of a library-wide run.
 */
export const VISION_MAX_EDGE = 1024

export interface VisionImage {
  base64: string
  mediaType: 'image/jpeg'
  width: number
  height: number
}

async function encode(input: string | Buffer): Promise<VisionImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(VISION_MAX_EDGE, VISION_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true })

  return {
    base64: data.toString('base64'),
    mediaType: 'image/jpeg',
    width: info.width,
    height: info.height,
  }
}

export async function visionImage(source: string): Promise<VisionImage> {
  return encode(source)
}

/**
 * Frames for describing a clip. One poster frame cannot tell a slow pan from a
 * dance, so three evenly spaced frames are sampled — enough to read the scene
 * and the action without tripling the bill on every asset in the library.
 */
export async function visionFrames(
  source: string,
  durationSec: number | null,
  count = 3,
): Promise<VisionImage[]> {
  const duration = durationSec && durationSec > 0 ? durationSec : 0
  const frames: VisionImage[] = []

  for (let index = 0; index < count; index++) {
    // Sample inside the clip: the first and last moments are often a blur or a
    // black lead-in.
    const position = (index + 1) / (count + 1)
    const seek = duration > 0 ? Math.min(duration * position, Math.max(duration - 0.1, 0)) : 0
    const framePath = path.join(
      path.dirname(source),
      `.vision-${index}-${path.basename(source)}.png`,
    )

    try {
      await runFfmpeg(ffmpeg(source).seekInput(seek).frames(1).outputOptions('-q:v', '2').output(framePath))
      frames.push(await encode(framePath))
    } catch {
      // A clip shorter than the seek point simply yields fewer frames.
    } finally {
      await unlink(framePath).catch(() => {})
    }
  }

  return frames
}
