import { NextResponse } from 'next/server'
import { isAiConfigured } from '@reelforge/ai'
import { fromJson, prisma } from '@reelforge/db'
import { RENDER_TARGETS, type RenderTarget } from '@reelforge/shared'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set — add it to .env and restart' },
      { status: 400 },
    )
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const targets = fromJson<string[]>(project.targetsJson, []).filter((target): target is RenderTarget =>
    RENDER_TARGETS.includes(target as RenderTarget),
  )
  if (targets.length === 0) {
    return NextResponse.json({ error: 'This project has no output formats' }, { status: 400 })
  }

  const available = await prisma.asset.count({
    where: { excluded: false, ...(project.consentFilter ? { consentCleared: true } : {}) },
  })
  if (available === 0) {
    return NextResponse.json(
      {
        error: project.consentFilter
          ? 'No consent-cleared assets are available — clear some in the library first'
          : 'The library is empty',
      },
      { status: 400 },
    )
  }

  const job = await createJob({
    type: 'plan',
    projectId: project.id,
    message: `Queued ${targets.length} cut(s) for planning`,
  })
  await enqueue('plan', 'plan', { jobId: job.id, projectId: project.id, targets })

  return NextResponse.json({ jobId: job.id, targets })
}
