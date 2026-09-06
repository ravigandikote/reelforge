import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@reelforge/db'
import { connectedAccount, describeDriveError, listFolder, parseFolderId } from '@reelforge/google'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  folder: z.string().min(1),
  markCleared: z.boolean().default(false),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paste a Drive folder link' }, { status: 400 })
  }

  const folderId = parseFolderId(parsed.data.folder)
  if (!folderId) {
    return NextResponse.json(
      { error: 'That does not look like a Drive folder link or id' },
      { status: 400 },
    )
  }

  const account = await connectedAccount()
  if (!account) return NextResponse.json({ error: 'Connect a Google account first' }, { status: 401 })

  let files
  try {
    files = await listFolder(account.id, folderId)
  } catch (err) {
    return NextResponse.json({ error: describeDriveError(err) }, { status: 502 })
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: 'That folder has no photos or videos the connected account can read' },
      { status: 404 },
    )
  }

  const batch = await prisma.ingestBatch.create({
    data: {
      source: 'google_drive',
      externalRef: folderId,
      status: 'pending',
      accountId: account.id,
    },
  })

  const job = await createJob({ type: 'ingest', message: `Queued ${files.length} Drive file(s)` })
  await enqueue('ingest', 'drive', {
    jobId: job.id,
    batchId: batch.id,
    source: 'google_drive',
    items: [],
    remoteItems: files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind: file.kind,
      url: null,
    })),
    accountId: account.id,
    externalRef: folderId,
    markCleared: parsed.data.markCleared,
  })

  return NextResponse.json({ jobId: job.id, batchId: batch.id, count: files.length })
}
