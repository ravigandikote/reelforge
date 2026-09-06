/** Render targets. One EDL is planned per target — the 30s cut is a real re-edit. */
export const RENDER_TARGETS = [
  'youtube_16x9',
  'portrait_9x16_30',
  'portrait_9x16_60',
  'portrait_9x16_90',
] as const

export type RenderTarget = (typeof RENDER_TARGETS)[number]

export interface RenderFormat {
  id: RenderTarget
  label: string
  width: number
  height: number
  fps: number
  /** null = length is driven by the script, not a fixed duration. */
  targetSeconds: number | null
  hasTitleCard: boolean
  hasEndCard: boolean
}

export const RENDER_FORMATS: Record<RenderTarget, RenderFormat> = {
  youtube_16x9: {
    id: 'youtube_16x9',
    label: 'YouTube 16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    targetSeconds: null,
    hasTitleCard: true,
    hasEndCard: true,
  },
  portrait_9x16_30: {
    id: 'portrait_9x16_30',
    label: 'Reel / Short — 30s',
    width: 1080,
    height: 1920,
    fps: 30,
    targetSeconds: 30,
    hasTitleCard: false,
    hasEndCard: true,
  },
  portrait_9x16_60: {
    id: 'portrait_9x16_60',
    label: 'Reel / Short — 60s',
    width: 1080,
    height: 1920,
    fps: 30,
    targetSeconds: 60,
    hasTitleCard: false,
    hasEndCard: true,
  },
  portrait_9x16_90: {
    id: 'portrait_9x16_90',
    label: 'Reel / Short — 90s',
    width: 1080,
    height: 1920,
    fps: 30,
    targetSeconds: 90,
    hasTitleCard: true,
    hasEndCard: true,
  },
}

/** An EDL must land within this many seconds of its target duration. */
export const DURATION_TOLERANCE_SEC = 0.5

/** No caption may be on screen for less than this. */
export const MIN_CAPTION_SEC = 1.2

/** Shortest usable shot; below this a cut reads as a glitch. */
export const MIN_SEGMENT_SEC = 1.2

/** Longest single shot before the edit feels static. */
export const MAX_SEGMENT_SEC = 8
