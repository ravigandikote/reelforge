import { NextResponse } from 'next/server'
import { isAiConfigured } from '@reelforge/ai'
import { fromJson, prisma } from '@reelforge/db'
import { RENDER_TARGETS, type RenderTarget } from '@reelforge/shared'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Plan what is missing, narrate it, render every cut — one job, one progress bar. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}))
  const replan = body?.replan === true

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { edls: { select: { id: true } } },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const targets = fromJson<string[]>(project.targetsJson, []).filter((target): target is RenderTarget =>
    RENDER_TARGETS.includes(target as RenderTarget),
  )
  if (targets.length === 0) {
    return NextResponse.json({ error: 'This project has no output formats' }, { status: 400 })
  }

  // Planning is the only stage that always needs the API; an already-planned
  // project can be rendered with no key at all.
  if ((replan || project.edls.length === 0) && !isAiConfigured()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set — needed to plan the edit' },
      { status: 400 },
    )
  }

  const job = await createJob({
    type: 'pipeline',
    projectId: project.id,
    message: `Producing ${targets.length} film(s)`,
  })
  await enqueue('pipeline', 'produce', { jobId: job.id, projectId: project.id, targets, replan })

  return NextResponse.json({ jobId: job.id, targets })
}
