import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import busboy from 'busboy'
import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { isSupportedMedia } from '@reelforge/media/mime'
import { ensureDir, stagingDir } from '@reelforge/media/paths'
import { getEnv } from '@reelforge/shared/env'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 3600

interface ParsedUpload {
  files: string[]
  skipped: string[]
  markCleared: boolean
  tooLarge: string[]
}

/**
 * Multipart is parsed with busboy rather than request.formData() so a 2 GB clip
 * streams straight to disk instead of being held in memory as a Blob.
 */
function parseUpload(
  request: Request,
  destination: string,
  maxBytes: number,
): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      return reject(new Error('Expected a multipart/form-data upload'))
    }
    if (!request.body) return reject(new Error('Empty request body'))

    const result: ParsedUpload = { files: [], skipped: [], markCleared: false, tooLarge: [] }
    const writes: Promise<void>[] = []
    const bb = busboy({ headers: { 'content-type': contentType }, limits: { fileSize: maxBytes } })

    bb.on('field', (name, value) => {
      if (name === 'markCleared') result.markCleared = value === 'true'
    })

    bb.on('file', (_name, stream, info) => {
      const base = path.basename(info.filename || 'upload')
      const isZip = base.toLowerCase().endsWith('.zip')

      if (!isZip && !isSupportedMedia(base)) {
        result.skipped.push(base)
        return stream.resume()
      }

      // One directory per file, so two uploads of the same name both survive
      // and the staged filename stays exactly what the user chose.
      const dir = path.join(destination, String(result.files.length))
      const target = path.join(dir, base)
      result.files.push(target)
      stream.on('limit', () => result.tooLarge.push(base))
      writes.push(ensureDir(dir).then(() => pipeline(stream, createWriteStream(target))))
    })

    bb.on('error', reject)
    bb.on('close', () => {
      Promise.all(writes)
        .then(() => resolve(result))
        .catch(reject)
    })

    pipeline(Readable.fromWeb(request.body as never), bb).catch(reject)
  })
}

export async function POST(request: Request) {
  const env = getEnv()
  const batch = await prisma.ingestBatch.create({
    data: { source: 'upload', status: 'pending' },
  })
  const destination = await ensureDir(path.join(stagingDir(), batch.id))

  const fail = async (message: string, status: number) => {
    await prisma.ingestBatch.update({
      where: { id: batch.id },
      data: { status: 'failed', error: message },
    })
    return NextResponse.json({ error: message }, { status })
  }

  let parsed: ParsedUpload
  try {
    parsed = await parseUpload(request, destination, env.MAX_UPLOAD_MB * 1024 * 1024)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Upload failed', 400)
  }

  if (parsed.tooLarge.length > 0) {
    return fail(`Over the ${env.MAX_UPLOAD_MB} MB limit: ${parsed.tooLarge.join(', ')}`, 413)
  }

  if (parsed.files.length === 0) {
    return fail(
      parsed.skipped.length
        ? `Nothing supported in this upload (skipped ${parsed.skipped.join(', ')})`
        : 'No files were uploaded',
      400,
    )
  }

  const job = await createJob({ type: 'ingest', message: 'Queued for ingest' })
  await enqueue('ingest', 'upload', {
    jobId: job.id,
    batchId: batch.id,
    source: 'upload',
    items: parsed.files,
    externalRef: null,
    markCleared: parsed.markCleared,
  })

  return NextResponse.json({
    jobId: job.id,
    batchId: batch.id,
    accepted: parsed.files.length,
    skipped: parsed.skipped,
  })
}
