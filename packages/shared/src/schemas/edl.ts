import { z } from 'zod'
import { RENDER_TARGETS } from '../constants/formats.js'

export const motionSchema = z.enum([
  'ken_burns_in',
  'ken_burns_out',
  'pan_left',
  'pan_right',
  'hold',
  /** Videos only: play the source between trimStartSec and trimEndSec. */
  'trim',
])
export type Motion = z.infer<typeof motionSchema>

export const segmentSchema = z
  .object({
    index: z.number().int().min(0),
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    assetId: z.string().min(1),
    motion: motionSchema,
    trimStartSec: z.number().min(0).nullable().default(null),
    trimEndSec: z.number().min(0).nullable().default(null),
    captionText: z.string().nullable().default(null),
    voiceoverText: z.string().nullable().default(null),
  })
  .refine((s) => s.endSec > s.startSec, {
    message: 'endSec must be greater than startSec',
    path: ['endSec'],
  })
  .refine((s) => s.motion !== 'trim' || (s.trimStartSec !== null && s.trimEndSec !== null), {
    message: 'motion "trim" requires trimStartSec and trimEndSec',
    path: ['motion'],
  })

export type EdlSegment = z.infer<typeof segmentSchema>

/** Exactly what the planning model must return. Structural rules live in validateEdl(). */
export const edlSchema = z.object({
  target: z.enum(RENDER_TARGETS),
  titleText: z.string().nullable().default(null),
  segments: z.array(segmentSchema).min(1),
})
export type Edl = z.infer<typeof edlSchema>

export const edlPlanResponseSchema = z.object({
  edls: z.array(edlSchema).min(1),
})
export type EdlPlanResponse = z.infer<typeof edlPlanResponseSchema>

/**
 * What the planner is asked to return: segment lengths, not timeline positions.
 * The tool schema already constrains this shape, so a parse failure here means
 * the model drifted from its own schema — worth failing the cut over.
 */
export const plannedSegmentSchema = z.object({
  assetId: z.string().min(1),
  durationSec: z.number().positive().max(60),
  motion: motionSchema,
  trimStartSec: z.number().min(0).nullish().default(null),
  captionText: z.string().nullish().default(null),
  voiceoverText: z.string().nullish().default(null),
})

export const planResponseSchema = z.object({
  titleText: z.string().nullish().default(null),
  segments: z.array(plannedSegmentSchema).min(1),
})
export type PlanResponse = z.infer<typeof planResponseSchema>
