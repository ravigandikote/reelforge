import { z } from 'zod'
import { TAG_VOCABULARY } from '../constants/tags.js'

export const assetKindSchema = z.enum(['photo', 'video'])
export type AssetKind = z.infer<typeof assetKindSchema>

export const orientationSchema = z.enum(['landscape', 'portrait', 'square'])
export type Orientation = z.infer<typeof orientationSchema>

export const ingestSourceSchema = z.enum([
  'upload',
  'google_photos_picker',
  'google_drive',
  'share_link',
])
export type IngestSource = z.infer<typeof ingestSourceSchema>

const tagSlugs = TAG_VOCABULARY.map((t) => t.slug) as [string, ...string[]]
export const tagSlugSchema = z.enum(tagSlugs)

/**
 * Tags the vision pass may emit. Admin tags (cleared, indian_flag) are excluded:
 * consent is a human decision, and the flag comes back as its own boolean so it
 * cannot be lost among the descriptive tags.
 */
export const AI_TAG_SLUGS = TAG_VOCABULARY.filter((t) => t.group !== 'admin').map((t) => t.slug) as [
  string,
  ...string[],
]
export const aiTagSlugSchema = z.enum(AI_TAG_SLUGS)

/** Output contract for the vision pass (build step 4). Validated before any DB write. */
export const assetAnalysisSchema = z.object({
  description: z.string().min(1).max(200),
  tags: z.array(aiTagSlugSchema).max(8),
  peopleCount: z.number().int().min(0).max(500),
  /** Subject centre, 0..1 of width/height. Drives smart crop, never a blind centre crop. */
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  /** Assets with the Indian flag are excluded from ken-burns, crops and overlays. */
  containsIndianFlag: z.boolean(),
})
export type AssetAnalysis = z.infer<typeof assetAnalysisSchema>

/** Slice of an asset the planner is allowed to see. */
export const catalogueEntrySchema = z.object({
  id: z.string(),
  kind: assetKindSchema,
  orientation: orientationSchema,
  width: z.number().int(),
  height: z.number().int(),
  durationSec: z.number().nullable(),
  capturedAt: z.string().nullable(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  peopleCount: z.number().int().nullable(),
  hasIndianFlag: z.boolean(),
})
export type CatalogueEntry = z.infer<typeof catalogueEntrySchema>
