import { z } from 'zod'
import { prisma } from '@reelforge/db'

export const scopeSchema = z.object({
  /** "unanalyzed" is the default: re-describing what is done costs money for nothing. */
  scope: z.enum(['unanalyzed', 'all', 'selected']).default('unanalyzed'),
  assetIds: z.array(z.string()).default([]),
})

export type AnalyzeScope = z.infer<typeof scopeSchema>

export async function selectAssets(scope: AnalyzeScope['scope'], assetIds: string[]) {
  const where =
    scope === 'selected' ? { id: { in: assetIds } } : scope === 'all' ? {} : { analyzedAt: null }

  return prisma.asset.findMany({
    where: { ...where, excluded: false },
    select: { id: true, kind: true, width: true, height: true },
    orderBy: { createdAt: 'asc' },
  })
}
