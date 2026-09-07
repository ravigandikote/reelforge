import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isAiConfigured, regenerateSegment } from '@reelforge/ai'
import { prisma } from '@reelforge/db'
import {
  validateEdl,
  type CatalogueEntry,
  type PlannedSegment,
  type PlannerAsset,
  type RenderTarget,
} from '@reelforge/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({ note: z.string().max(500).nullish() })

/**
 * Re-plans one segment in place. The slot keeps its length, so the film's
 * duration and every other segment's timing are untouched — and the result goes
 * through the same validator as a full plan before it is written.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  const note = parsed.success ? (parsed.data.note ?? null) : null

  const segment = await prisma.segment.findUnique({
    where: { id: params.id },
    include: { edl: { include: { project: true, segments: { orderBy: { index: 'asc' } } } } },
  })
  if (!segment) return NextResponse.json({ error: 'Segment not found' }, { status: 404 })

  const { edl } = segment
  const project = edl.project

  const assets = await prisma.asset.findMany({
    where: { excluded: false, ...(project.consentFilter ? { consentCleared: true } : {}) },
    include: { tags: { include: { tag: true } } },
  })
  if (assets.length === 0) {
    return NextResponse.json({ error: 'No assets are available to choose from' }, { status: 400 })
  }

  const catalogue: CatalogueEntry[] = assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind === 'video' ? 'video' : 'photo',
    orientation: asset.orientation as CatalogueEntry['orientation'],
    width: asset.width,
    height: asset.height,
    durationSec: asset.durationSec,
    capturedAt: asset.capturedAt?.toISOString() ?? null,
    description: asset.description,
    tags: asset.tags.map((link) => link.tag.slug),
    peopleCount: asset.peopleCount,
    hasIndianFlag: asset.hasIndianFlag,
  }))

  const toPlanned = (source: (typeof edl.segments)[number]): PlannedSegment => ({
    assetId: source.assetId,
    durationSec: Math.round((source.endSec - source.startSec) * 1000) / 1000,
    motion: source.motion as PlannedSegment['motion'],
    trimStartSec: source.trimStartSec,
    captionText: source.captionText,
    voiceoverText: source.voiceoverText,
  })

  const ordered = edl.segments
  const position = ordered.findIndex((candidate) => candidate.id === segment.id)

  let replacement
  try {
    replacement = await regenerateSegment({
      target: edl.target as RenderTarget,
      script: project.script,
      current: toPlanned(segment),
      previous: position > 0 ? toPlanned(ordered[position - 1]!) : null,
      next: position < ordered.length - 1 ? toPlanned(ordered[position + 1]!) : null,
      durationSec: Math.round((segment.endSec - segment.startSec) * 1000) / 1000,
      catalogue,
      voiceEnabled: project.voiceEnabled,
      note,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not re-plan this segment' },
      { status: 502 },
    )
  }

  // The replacement is validated in the context of the whole cut, so a swap
  // cannot introduce an uncleared asset or a trim past the end of a clip.
  const lookup = new Map<string, PlannerAsset>(
    assets.map((asset) => [
      asset.id,
      {
        id: asset.id,
        kind: asset.kind === 'video' ? 'video' : 'photo',
        durationSec: asset.durationSec,
        consentCleared: asset.consentCleared,
        hasIndianFlag: asset.hasIndianFlag,
      },
    ]),
  )

  const proposed = ordered.map((candidate, index) =>
    index === position ? replacement.segment : toPlanned(candidate),
  )
  const validation = validateEdl(proposed, {
    target: edl.target as RenderTarget,
    assets: lookup,
    consentFilter: project.consentFilter,
  })

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: `The replacement would break the cut: ${validation.issues
          .filter((issue) => issue.level === 'error')
          .map((issue) => issue.message)
          .join('; ')}`,
      },
      { status: 422 },
    )
  }

  const corrected = validation.segments[position]!
  const updated = await prisma.segment.update({
    where: { id: segment.id },
    data: {
      assetId: corrected.assetId,
      motion: corrected.motion,
      trimStartSec: corrected.trimStartSec,
      trimEndSec: corrected.trimEndSec,
      captionText: corrected.captionText,
      voiceoverText: corrected.voiceoverText,
      regenCount: { increment: 1 },
      // Word timings belonged to the line that was just replaced.
      words: { deleteMany: {} },
    },
    include: { asset: { select: { originalName: true } } },
  })

  return NextResponse.json({
    segment: updated,
    assetName: updated.asset.originalName,
    warnings: validation.issues.filter((issue) => issue.segment === position),
  })
}
