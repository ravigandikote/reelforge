import { z } from 'zod'
import { RENDER_TARGETS } from '@reelforge/shared'

/**
 * Everything a composition needs, as plain JSON: Remotion serialises props into
 * the bundle, so nothing here may be a class, a Date or a file handle.
 */
export const renderAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(['photo', 'video']),
  /** Path inside the public dir (the repo's media/ folder), e.g. "<id>/original.jpg". */
  src: z.string(),
  width: z.number(),
  height: z.number(),
  /** Subject centre, 0..1. Drives the crop when a landscape asset goes vertical. */
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
  /** Flagged assets are never cropped, moved or overlaid. */
  hasIndianFlag: z.boolean().default(false),
})
export type RenderAsset = z.infer<typeof renderAssetSchema>

export const renderSegmentSchema = z.object({
  index: z.number(),
  startSec: z.number(),
  endSec: z.number(),
  assetId: z.string(),
  motion: z.enum(['ken_burns_in', 'ken_burns_out', 'pan_left', 'pan_right', 'hold', 'trim']),
  trimStartSec: z.number().nullable().default(null),
  captionText: z.string().nullable().default(null),
  voiceoverText: z.string().nullable().default(null),
})
export type RenderSegment = z.infer<typeof renderSegmentSchema>

export const brandSchema = z.object({
  cream: z.string().default('#F4EBDA'),
  indigo: z.string().default('#1A2A46'),
  terracotta: z.string().default('#BE5F3A'),
  handle: z.string().default('@neerav_arts_village'),
  website: z.string().default('www.neeravartsvillage.com'),
  /** Paths inside the public dir, or null to fall back to the drawn emblem. */
  logoSrc: z.string().nullable().default(null),
  logoMarkSrc: z.string().nullable().default(null),
})
export type Brand = z.infer<typeof brandSchema>

/** A caption cue with its word timings, so the renderer can follow the speech. */
export const cueSchema = z.object({
  index: z.number(),
  startSec: z.number(),
  endSec: z.number(),
  text: z.string(),
  segmentIndex: z.number(),
  words: z
    .array(z.object({ word: z.string(), startSec: z.number(), endSec: z.number() }))
    .default([]),
})
export type Cue = z.infer<typeof cueSchema>

export const renderPropsSchema = z.object({
  target: z.enum(RENDER_TARGETS),
  segments: z.array(renderSegmentSchema),
  assets: z.array(renderAssetSchema),
  brand: brandSchema,
  /** Overlaid on the opening shot, never added to the running time. */
  titleText: z.string().nullable().default(null),
  subtitleText: z.string().nullable().default(null),
  showEndCard: z.boolean().default(true),
  captionsEnabled: z.boolean().default(true),
  /** Source audio is off by default: the voiceover and music beds own the track. */
  muteSourceAudio: z.boolean().default(true),
  /**
   * Speech-timed captions. When present these replace the per-segment caption
   * text, because a caption timed to the voice beats one timed to the cut.
   */
  cues: z.array(cueSchema).default([]),
  /** Optional narration track, added in build step 7. */
  voiceSrc: z.string().nullable().default(null),
  musicSrc: z.string().nullable().default(null),
})
export type RenderProps = z.infer<typeof renderPropsSchema>

/**
 * Remotion composition ids allow no underscores, so the target ids are
 * hyphenated for the registry: portrait_9x16_30 becomes portrait-9x16-30.
 */
export function compositionId(target: string): string {
  return target.replace(/_/g, '-')
}

export const DEFAULT_BRAND: Brand = {
  cream: '#F4EBDA',
  indigo: '#1A2A46',
  terracotta: '#BE5F3A',
  handle: '@neerav_arts_village',
  website: 'www.neeravartsvillage.com',
  logoSrc: null,
  logoMarkSrc: null,
}
