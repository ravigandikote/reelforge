import path from 'node:path'

const IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
}

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
}

export function mimeForFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_TYPES[ext] ?? VIDEO_TYPES[ext] ?? null
}

export function kindForFile(filePath: string): 'photo' | 'video' | null {
  const ext = path.extname(filePath).toLowerCase()
  if (ext in IMAGE_TYPES) return 'photo'
  if (ext in VIDEO_TYPES) return 'video'
  return null
}

export const SUPPORTED_EXTENSIONS = [
  ...Object.keys(IMAGE_TYPES),
  ...Object.keys(VIDEO_TYPES),
]

/** True for files ReelForge can catalogue; everything else is skipped with a note. */
export function isSupportedMedia(filePath: string): boolean {
  return kindForFile(filePath) !== null
}
