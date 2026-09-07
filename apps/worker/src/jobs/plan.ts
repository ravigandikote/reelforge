import { costUsd, planEdl } from '@reelforge/ai'
import { prisma } from '@reelforge/db'
import {
  DURATION_TOLERANCE_SEC,
  RENDER_FORMATS,
  clampSegments,
  fitDuration,
  planJobSchema,
  validateEdl,
  type CatalogueEntry,
  type PlannerAsset,
  type RenderTarget,
} from '@reelforge/shared'
import { markStatus, report } from '../progress.js'

/**
 * Plans one edit per target. Each is its own call — a 30-second cut is a
 * different edit from the 90, not the first 30 seconds of it — and the script
 * and catalogue are identical across those calls, so the cached prefix pays for
 * most of the extra requests.
 */
export async function runPlan(raw: unknown): Promise<void> {
  const { jobId, projectId, targets } = planJobSchema.parse(raw)

  await markStatus(jobId, 'running')

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('That project no longer exists')

    const assets = await prisma.asset.findMany({
      where: {
        excluded: false,
        ...(project.consentFilter ? { consentCleared: true } : {}),
      },
      include: { tags: { include: { tag: true } } },
      orderBy: [{ capturedAt: 'asc' }, { createdAt: 'asc' }],
    })

    if (assets.length === 0) {
      throw new Error(
        project.consentFilter
          ? 'No consent-cleared assets are available. Clear some in the library, or turn the consent filter off for this project.'
          : 'The library is empty',
      )
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

    const undescribed = assets.filter((asset) => !asset.description).length
    if (undescribed > 0) {
      await report(
        jobId,
        2,
        `${undescribed} of ${assets.length} assets have no AI description — the planner is choosing those blind`,
        { level: 'warn' },
      )
    }

    let inputTokens = 0
    let outputTokens = 0
    let cachedTokens = 0
    let model = ''
    let planned = 0
    const blocked: string[] = []

    for (const [index, target] of targets.entries()) {
      const format = RENDER_FORMATS[target as RenderTarget]
      const base = 4 + (index / targets.length) * 92
      await report(jobId, base, `Planning the ${format.label} cut…`)

      const result = await planEdl({
        script: project.script,
        target: target as RenderTarget,
        catalogue,
        voiceEnabled: project.voiceEnabled,
        projectTitle: project.title,
      })

      inputTokens += result.inputTokens
      outputTokens += result.outputTokens
      cachedTokens += result.cachedTokens
      model = result.model

      // The model is asked for roughly the right length; the arithmetic that
      // lands it inside ±0.5s is done here, where it cannot be got wrong.
      // The 16:9 cut runs to the length of the script, so it is only clamped to
      // what each asset can support; the fixed-length cuts are retimed onto
      // their target as well.
      const fit =
        format.targetSeconds === null
          ? { ...clampSegments(result.segments, lookup), fitted: true }
          : fitDuration(result.segments, format.targetSeconds, lookup, DURATION_TOLERANCE_SEC)

      for (const note of fit.notes) {
        await report(jobId, base, `${format.label}: ${note}`, { level: 'warn' })
      }

      const validation = validateEdl(fit.segments, {
        target: target as RenderTarget,
        assets: lookup,
        consentFilter: project.consentFilter,
      })

      await persist(projectId, target, format.targetSeconds, validation, result)

      for (const issue of validation.issues) {
        await report(jobId, base, `${format.label}: ${issue.message}`, {
          level: issue.level === 'error' ? 'error' : 'warn',
        })
      }

      if (validation.ok) {
        planned += 1
        await report(
          jobId,
          4 + ((index + 1) / targets.length) * 92,
          `${format.label}: ${validation.segments.length} segments, ${validation.totalSeconds}s`,
        )
      } else {
        blocked.push(format.label)
      }
    }

    const usd = model ? costUsd(model, inputTokens, outputTokens) : 0
    const summary = [
      `${planned} of ${targets.length} cuts planned`,
      blocked.length ? `blocked: ${blocked.join(', ')}` : null,
      `$${usd.toFixed(4)}`,
      cachedTokens ? `${cachedTokens.toLocaleString()} tokens served from cache` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    await report(jobId, 100, summary, { data: { planned, blocked, inputTokens, outputTokens, usd } })
    await markStatus(jobId, planned > 0 ? 'succeeded' : 'failed', {
      costCents: Math.ceil(usd * 100),
      error: planned === 0 ? `No cut passed validation (${blocked.join(', ')})` : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await report(jobId, 100, message, { level: 'error' })
    await markStatus(jobId, 'failed', { error: message })
    throw err
  }
}

/** Every plan is stored, valid or not — a blocked cut is easier to fix when you can see it. */
async function persist(
  projectId: string,
  target: string,
  targetSeconds: number | null,
  validation: ReturnType<typeof validateEdl>,
  result: Awaited<ReturnType<typeof planEdl>>,
): Promise<void> {
  const previous = await prisma.edl.findFirst({
    where: { projectId, target },
    orderBy: { version: 'desc' },
    select: { version: true },
  })

  await prisma.edl.create({
    data: {
      projectId,
      target,
      targetSeconds: targetSeconds ?? validation.totalSeconds,
      actualSeconds: validation.totalSeconds,
      version: (previous?.version ?? 0) + 1,
      model: result.model,
      promptTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      rawJson: JSON.stringify({
        titleText: result.titleText,
        plan: result.raw,
        issues: validation.issues,
        ok: validation.ok,
      }),
      segments: {
        create: validation.segments.map((segment) => ({
          index: segment.index,
          startSec: segment.startSec,
          endSec: segment.endSec,
          assetId: segment.assetId,
          motion: segment.motion,
          trimStartSec: segment.trimStartSec,
          trimEndSec: segment.trimEndSec,
          captionText: segment.captionText,
          voiceoverText: segment.voiceoverText,
        })),
      },
    },
  })
}
