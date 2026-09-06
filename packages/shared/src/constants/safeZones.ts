import type { RenderTarget } from './formats.js'

/**
 * Fractions of frame height/width kept clear of the platform UI.
 * Instagram Reels and YouTube Shorts both overlay the bottom ~20% (caption,
 * audio pill, action bar) and the top ~10% (status bar + header).
 */
export interface SafeZone {
  top: number
  bottom: number
  left: number
  right: number
  /** Vertical band where burned-in captions sit, as fractions of height. */
  captionBand: { top: number; bottom: number }
}

export const SAFE_ZONES: Record<RenderTarget, SafeZone> = {
  youtube_16x9: {
    top: 0.05,
    bottom: 0.08,
    left: 0.05,
    right: 0.05,
    captionBand: { top: 0.78, bottom: 0.9 },
  },
  portrait_9x16_30: {
    top: 0.12,
    bottom: 0.22,
    left: 0.06,
    right: 0.06,
    captionBand: { top: 0.6, bottom: 0.74 },
  },
  portrait_9x16_60: {
    top: 0.12,
    bottom: 0.22,
    left: 0.06,
    right: 0.06,
    captionBand: { top: 0.6, bottom: 0.74 },
  },
  portrait_9x16_90: {
    top: 0.12,
    bottom: 0.22,
    left: 0.06,
    right: 0.06,
    captionBand: { top: 0.6, bottom: 0.74 },
  },
}
