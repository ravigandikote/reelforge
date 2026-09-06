import exifr from 'exifr'
import sharp from 'sharp'
import { ffprobeAsync } from './ffmpeg.js'
import { kindForFile, mimeForFile } from './mime.js'
import { orientationOf, type ProbeResult } from './types.js'

/** EXIF fields worth keeping; the rest is dropped rather than stored verbatim. */
const EXIF_KEYS = [
  'Make',
  'Model',
  'LensModel',
  'FNumber',
  'ExposureTime',
  'ISO',
  'FocalLength',
  'Orientation',
] as const

export async function probeImage(filePath: string): Promise<ProbeResult> {
  const meta = await sharp(filePath).metadata()
  // sharp reports pre-rotation dimensions; EXIF orientation 5-8 means the
  // displayed image is the other way round.
  const rotated = (meta.orientation ?? 1) >= 5
  const width = (rotated ? meta.height : meta.width) ?? 0
  const height = (rotated ? meta.width : meta.height) ?? 0

  let exif: Record<string, unknown> = {}
  let capturedAt: Date | null = null
  try {
    const parsed = await exifr.parse(filePath, { tiff: true, exif: true, gps: false })
    if (parsed) {
      for (const key of EXIF_KEYS) {
        if (parsed[key] !== undefined) exif[key] = parsed[key]
      }
      const taken = parsed.DateTimeOriginal ?? parsed.CreateDate ?? parsed.ModifyDate
      if (taken instanceof Date && !Number.isNaN(taken.valueOf())) capturedAt = taken
    }
  } catch {
    // Not every image carries EXIF (screenshots, exports) — that is not an error.
    exif = {}
  }

  return {
    kind: 'photo',
    mimeType: mimeForFile(filePath) ?? `image/${meta.format ?? 'jpeg'}`,
    width,
    height,
    orientation: orientationOf(width, height),
    durationSec: null,
    fps: null,
    hasAudio: false,
    capturedAt,
    metadata: { ...exif, format: meta.format, space: meta.space },
  }
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const data = await ffprobeAsync(filePath)
  const video = data.streams.find((s) => s.codec_type === 'video')
  if (!video) throw new Error('No video stream found')
  const audio = data.streams.find((s) => s.codec_type === 'audio')

  const rotation = rotationOf(video)
  const rawWidth = video.width ?? 0
  const rawHeight = video.height ?? 0
  // Phone footage is usually recorded landscape with a 90° rotation flag; using
  // the raw dimensions would file every vertical clip as landscape.
  const swap = rotation === 90 || rotation === 270
  const width = swap ? rawHeight : rawWidth
  const height = swap ? rawWidth : rawHeight

  const creation = data.format?.tags?.creation_time ?? video.tags?.creation_time
  const capturedAt = creation ? new Date(String(creation)) : null

  return {
    kind: 'video',
    mimeType: mimeForFile(filePath) ?? 'video/mp4',
    width,
    height,
    orientation: orientationOf(width, height),
    durationSec: Number(data.format?.duration ?? video.duration ?? 0) || null,
    fps: parseFrameRate(video.avg_frame_rate ?? video.r_frame_rate),
    hasAudio: Boolean(audio),
    capturedAt: capturedAt && !Number.isNaN(capturedAt.valueOf()) ? capturedAt : null,
    metadata: {
      codec: video.codec_name,
      rotation,
      bitRate: data.format?.bit_rate,
      audioCodec: audio?.codec_name,
    },
  }
}

export async function probeFile(filePath: string): Promise<ProbeResult> {
  const kind = kindForFile(filePath)
  if (kind === 'video') return probeVideo(filePath)
  if (kind === 'photo') {
    try {
      return await probeImage(filePath)
    } catch (err) {
      // sharp's prebuilt libvips has no HEIC support; FFmpeg can still read some
      // of those files, so fall back rather than dropping the asset.
      const fallback = await probeVideo(filePath).catch(() => null)
      if (fallback) return { ...fallback, kind: 'photo', durationSec: null, fps: null, hasAudio: false }
      throw err
    }
  }
  throw new Error(`Unsupported file type: ${filePath}`)
}

/**
 * Rotation can arrive three ways: a display matrix in side_data_list, the same
 * value flattened onto the stream by fluent-ffmpeg's ffprobe parser, or the
 * legacy `rotate` tag on older files. A phone portrait clip usually reports
 * -90, which normalises to 270.
 */
function rotationOf(stream: { tags?: Record<string, unknown> } & Record<string, unknown>): number {
  const sideData = (stream as { side_data_list?: Array<Record<string, unknown>> }).side_data_list
  const fromSideData = sideData?.find((d) => d.rotation !== undefined)?.rotation
  const raw = fromSideData ?? stream.rotation ?? stream.tags?.rotate ?? 0
  const value = Math.round(Number(raw))
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null
  const [num, den] = rate.split('/').map(Number)
  if (!num || !den) return null
  const fps = num / den
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 100) / 100 : null
}
