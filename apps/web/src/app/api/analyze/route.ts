import { NextResponse } from 'next/server'
import { estimateAnalysis, isAiConfigured } from '@reelforge/ai'
import { getEnv } from '@reelforge/shared/env'
import { createJob, enqueue } from '@/lib/jobs'
import { scopeSchema, selectAssets } from '@/lib/analyze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not set — add it to .env and restart' },
      { status: 400 },
    )
  }

  const parsed = scopeSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const assets = await selectAssets(parsed.data.scope, parsed.data.assetIds)
  if (assets.length === 0) {
    return NextResponse.json({ error: 'Nothing to describe' }, { status: 400 })
  }

  const estimate = estimateAnalysis(assets)
  const ceiling = getEnv().AI_MAX_BATCH_COST_USD
  if (estimate.usd > ceiling) {
    // A mis-click on a 10,000-asset library should not quietly spend a fortune.
    return NextResponse.json(
      {
        error: `This batch would cost about $${estimate.usd.toFixed(2)}, over the $${ceiling.toFixed(2)} limit (AI_MAX_BATCH_COST_USD). Select fewer assets or raise the limit.`,
      },
      { status: 400 },
    )
  }

  const job = await createJob({
    type: 'analyze',
    message: `Queued ${assets.length} asset(s) for description`,
  })
  await enqueue('analyze', 'describe', { jobId: job.id, assetIds: assets.map((a) => a.id) })

  return NextResponse.json({ jobId: job.id, count: assets.length, estimate })
}
