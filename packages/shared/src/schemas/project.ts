import { z } from 'zod'
import { RENDER_TARGETS } from '../constants/formats.js'

export const projectOptionsSchema = z.object({
  title: z.string().min(1).max(120),
  script: z.string().min(20, 'A script needs at least a sentence or two'),
  targets: z.array(z.enum(RENDER_TARGETS)).min(1),
  voiceEnabled: z.boolean().default(true),
  voiceId: z.string().nullable().default(null),
  musicTrackId: z.string().nullable().default(null),
  brandKitId: z.string().nullable().default(null),
  /** On by default: only consentCleared assets reach the planner or a render. */
  consentFilter: z.boolean().default(true),
})
export type ProjectOptions = z.infer<typeof projectOptionsSchema>
