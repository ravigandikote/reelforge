import path from 'node:path'
import { ffmpeg, runFfmpeg } from './ffmpeg.js'
import { ensureDir } from './paths.js'

export const PROXY_HEIGHT = 720

/**
 * A 720p H.264 proxy per video. Originals are never touched, and neither the
 * preview player nor Remotion should be decoding 4K HEVC off a phone.
 * `-movflags +faststart` lets the browser start playing before the file is done
 * downloading.
 */
export async function makeProxy(
  source: string,
  destination: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await ensureDir(path.dirname(destination))
  await runFfmpeg(
    ffmpeg(source)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions(
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        // Scale to 720p on the short edge, keeping aspect and even dimensions.
        '-vf', `scale='if(gt(iw,ih),-2,${PROXY_HEIGHT})':'if(gt(iw,ih),${PROXY_HEIGHT},-2)'`,
        '-movflags', '+faststart',
      )
      .output(destination),
    onProgress,
  )
}
