import { createRequire } from 'node:module'
import ffmpeg from 'fluent-ffmpeg'

const require = createRequire(import.meta.url)

function installerPath(pkg: string): string | null {
  try {
    const mod = require(pkg) as string | { path: string }
    return typeof mod === 'string' ? mod : mod.path
  } catch {
    return null
  }
}

/**
 * FFmpeg resolution order: an explicit FFMPEG_PATH/FFPROBE_PATH (use this for a
 * hardware-accelerated system build), then the bundled installer binaries, so a
 * fresh clone works without anyone installing FFmpeg by hand.
 */
export const ffmpegPath: string =
  process.env.FFMPEG_PATH || installerPath('ffmpeg-static') || 'ffmpeg'

export const ffprobePath: string =
  process.env.FFPROBE_PATH || installerPath('@ffprobe-installer/ffprobe') || 'ffprobe'

ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

export { ffmpeg }

export function ffprobeAsync(file: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

/** Runs a prepared command, forwarding percentage progress. */
export function runFfmpeg(
  command: ffmpeg.FfmpegCommand,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on('progress', (p) => {
        if (onProgress && typeof p.percent === 'number') {
          onProgress(Math.max(0, Math.min(100, p.percent)))
        }
      })
      .on('error', (err: Error) => reject(err))
      .on('end', () => resolve())
      .run()
  })
}
