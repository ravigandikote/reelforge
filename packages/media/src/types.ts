import type { AssetKind, Orientation } from '@reelforge/shared'

export interface ProbeResult {
  kind: AssetKind
  mimeType: string
  width: number
  height: number
  orientation: Orientation
  durationSec: number | null
  fps: number | null
  hasAudio: boolean
  capturedAt: Date | null
  /** Small, readable subset of the source metadata — never the whole EXIF blob. */
  metadata: Record<string, unknown>
}

export function orientationOf(width: number, height: number): Orientation {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}
