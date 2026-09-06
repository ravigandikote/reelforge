import { z } from 'zod'
import { RENDER_TARGETS } from '../constants/formats.js'
import { ingestSourceSchema } from './asset.js'

export const jobTypeSchema = z.enum([
  'ingest',
  'analyze',
  'plan',
  'tts',
  'render',
  'pipeline',
])
export type JobType = z.infer<typeof jobTypeSchema>

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])
export type JobStatus = z.infer<typeof jobStatusSchema>

/** BullMQ rejects ':' in queue names — it reserves the colon for its own key prefixes. */
export const QUEUE_NAMES = {
  ingest: 'reelforge-ingest',
  analyze: 'reelforge-analyze',
  plan: 'reelforge-plan',
  tts: 'reelforge-tts',
  render: 'reelforge-render',
} as const

export const ingestJobSchema = z.object({
  jobId: z.string(),
  batchId: z.string(),
  source: ingestSourceSchema,
  /** Upload: absolute staging paths. Picker/Drive: remote item ids. */
  items: z.array(z.string()).default([]),
  externalRef: z.string().nullable().default(null),
  /** Set when the uploader confirms the batch is already consent-cleared. */
  markCleared: z.boolean().default(false),
})
export type IngestJobData = z.infer<typeof ingestJobSchema>

export const analyzeJobSchema = z.object({
  jobId: z.string(),
  assetIds: z.array(z.string()).min(1),
})
export type AnalyzeJobData = z.infer<typeof analyzeJobSchema>

export const planJobSchema = z.object({
  jobId: z.string(),
  projectId: z.string(),
  targets: z.array(z.enum(RENDER_TARGETS)).min(1),
})
export type PlanJobData = z.infer<typeof planJobSchema>

export const ttsJobSchema = z.object({
  jobId: z.string(),
  edlId: z.string(),
})
export type TtsJobData = z.infer<typeof ttsJobSchema>

export const renderJobSchema = z.object({
  jobId: z.string(),
  edlId: z.string(),
  target: z.enum(RENDER_TARGETS),
})
export type RenderJobData = z.infer<typeof renderJobSchema>

/** Shape pushed over SSE to the job progress UI. */
export const jobProgressEventSchema = z.object({
  jobId: z.string(),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  message: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
  at: z.string(),
  data: z.unknown().optional(),
})
export type JobProgressEvent = z.infer<typeof jobProgressEventSchema>
