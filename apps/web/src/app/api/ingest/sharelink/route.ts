import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@reelforge/db'
import { scrapeShareLink } from '@reelforge/google/share'
import { getEnv } from '@reelforge/shared/env'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  url: z.string().url(),
  markCleared: z.boolean().default(false),
})

/**
 * UNSUPPORTED, behind ENABLE_SHARE_LINK_SCRAPER. Google does not offer an API
 * for public share links; this reads the page's HTML and will break without
 * warning. The Picker is the supported path.
 */
export async function POST(request: Request) {
  if (!getEnv().ENABLE_SHARE_LINK_SCRAPER) {
    return NextResponse.json(
      { error: 'Share-link ingest is disabled. Set ENABLE_SHARE_LINK_SCRAPER=true to try it.' },
      { status: 403 },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Paste a share link' }, { status: 400 })

  let items
  try {
    items = await scrapeShareLink(parsed.data.url)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read that share link' },
      { status: 502 },
    )
  }

  const batch = await prisma.ingestBatch.create({
    data: { source: 'share_link', externalRef: parsed.data.url, status: 'pending' },
  })

  const job = await createJob({ type: 'ingest', message: `Queued ${items.length} shared item(s)` })
  await enqueue('ingest', 'sharelink', {
    jobId: job.id,
    batchId: batch.id,
    source: 'share_link',
    items: [],
    remoteItems: items,
    accountId: null,
    externalRef: parsed.data.url,
    markCleared: parsed.data.markCleared,
  })

  return NextResponse.json({ jobId: job.id, batchId: batch.id, count: items.length })
}
