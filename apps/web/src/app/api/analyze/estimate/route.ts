import { NextResponse } from 'next/server'
import { estimateAnalysis, isAiConfigured } from '@reelforge/ai'
import { scopeSchema, selectAssets } from '@/lib/analyze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** What a run would cost, shown before anything is spent. */
export async function POST(request: Request) {
  const parsed = scopeSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const assets = await selectAssets(parsed.data.scope, parsed.data.assetIds)
  return NextResponse.json({
    configured: isAiConfigured(),
    estimate: estimateAnalysis(assets),
  })
}
