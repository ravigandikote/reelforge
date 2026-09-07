import { prisma } from '@reelforge/db'
import { RENDER_FORMATS, pipelineJobSchema, type RenderTarget } from '@reelforge/shared'
import { markStatus, report } from '../progress.js'
import { runPlan } from './plan.js'
import { runRender } from './render.js'
import { runTts } from './tts.js'

/**
 * Script to finished films in one job: plan what is missing, record the
 * narration, then render each cut.
 *
 * Each stage runs as its own child job so the job history stays legible and a
 * failure says which stage failed — while this job reports the one progress bar
 * the person watching actually cares about.
 */
export async function runPipeline(raw: unknown): Promise<void> {
  const { jobId, projectId, targets, replan } = pipelineJobSchema.parse(raw)

  await markStatus(jobId, 'running')

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) throw new Error('That project no longer exists')

    const missing = replan
      ? targets
      : await targetsWithoutPlans(projectId, targets as RenderTarget[])

    if (missing.length > 0) {
      await report(jobId, 3, `Planning ${missing.length} cut(s)…`)
      const child = await childJob(projectId, 'plan', `Planning ${missing.length} cut(s)`)
      await runPlan({ jobId: child, projectId, targets: missing })
    } else {
      await report(jobId, 3, 'Using the cuts already planned')
    }

    // Only cuts that passed validation are worth narrating or rendering.
    const edls = await currentEdls(projectId, targets as RenderTarget[])
    if (edls.length === 0) {
      throw new Error('No cut passed validation — open the project to see what is blocking it')
    }

    const span = 92 / edls.length
    for (const [index, edl] of edls.entries()) {
      const base = 6 + index * span
      const label = RENDER_FORMATS[edl.target as RenderTarget]?.label ?? edl.target

      if (replan || !edl.srtPath) {
        await report(jobId, base, `${label}: recording narration and captions…`)
        const child = await childJob(projectId, 'tts', `Voiceover for ${label}`, edl.target)
        await runTts({ jobId: child, edlId: edl.id })
      }

      await report(jobId, base + span * 0.35, `${label}: rendering…`)
      const child = await childJob(projectId, 'render', `Rendering ${label}`, edl.target)
      await runRender({ jobId: child, edlId: edl.id, target: edl.target })
    }

    const renders = await prisma.render.count({
      where: { edl: { projectId }, createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60) } },
    })
    await report(jobId, 100, `${edls.length} film(s) ready`, { data: { renders } })
    await markStatus(jobId, 'succeeded')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await report(jobId, 100, message, { level: 'error' })
    await markStatus(jobId, 'failed', { error: message })
    throw err
  }
}

async function childJob(
  projectId: string,
  type: string,
  message: string,
  target?: string,
): Promise<string> {
  const job = await prisma.job.create({
    data: { projectId, type, target: target ?? null, status: 'queued', message },
  })
  return job.id
}

async function targetsWithoutPlans(
  projectId: string,
  targets: RenderTarget[],
): Promise<RenderTarget[]> {
  const existing = await prisma.edl.findMany({
    where: { projectId, target: { in: targets } },
    select: { target: true },
    distinct: ['target'],
  })
  const planned = new Set(existing.map((edl) => edl.target))
  return targets.filter((target) => !planned.has(target))
}

/** The newest version of each requested cut, skipping any that failed validation. */
async function currentEdls(projectId: string, targets: RenderTarget[]) {
  const all = await prisma.edl.findMany({
    where: { projectId, target: { in: targets } },
    orderBy: [{ target: 'asc' }, { version: 'desc' }],
  })

  const newest = new Map<string, (typeof all)[number]>()
  for (const edl of all) if (!newest.has(edl.target)) newest.set(edl.target, edl)

  return [...newest.values()].filter((edl) => {
    try {
      return (JSON.parse(edl.rawJson) as { ok?: boolean }).ok !== false
    } catch {
      return true
    }
  })
}
