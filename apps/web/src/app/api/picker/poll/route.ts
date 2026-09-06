import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { connectedAccount, deleteSession, getSession, listPickedItems } from '@reelforge/google'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Polled by the browser while the picker tab is open. Google only exposes the
 * selection once mediaItemsSet flips true; at that point this hands the items to
 * the ingest queue and the normal job progress takes over.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const sessionId = params.get('sessionId')
  const markCleared = params.get('markCleared') === 'true'
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const account = await connectedAccount()
  if (!account) return NextResponse.json({ error: 'Connect a Google account first' }, { status: 401 })

  try {
    const session = await getSession(account.id, sessionId)
    if (!session.mediaItemsSet) {
      return NextResponse.json({ ready: false, pollIntervalMs: session.pollIntervalMs })
    }

    const items = await listPickedItems(account.id, sessionId)
    if (items.length === 0) {
      return NextResponse.json({ ready: true, error: 'Nothing was selected in the picker' })
    }

    const batch = await prisma.ingestBatch.create({
      data: {
        source: 'google_photos_picker',
        externalRef: sessionId,
        status: 'pending',
        accountId: account.id,
      },
    })

    const job = await createJob({ type: 'ingest', message: `Queued ${items.length} picked item(s)` })
    await enqueue('ingest', 'picker', {
      jobId: job.id,
      batchId: batch.id,
      source: 'google_photos_picker',
      items: [],
      remoteItems: items.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        kind: item.kind,
        url: item.url,
      })),
      accountId: account.id,
      externalRef: sessionId,
      markCleared,
    })

    // The selection is captured in the job payload, so the session can go now.
    await deleteSession(account.id, sessionId).catch(() => {})

    return NextResponse.json({ ready: true, jobId: job.id, batchId: batch.id, count: items.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Picker polling failed' },
      { status: 502 },
    )
  }
}
