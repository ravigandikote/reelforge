import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { toAbsolute } from '@reelforge/media/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VARIANTS = ['thumb', 'original', 'proxy'] as const
type Variant = (typeof VARIANTS)[number]

/**
 * Serves files out of media/ by asset id. Paths always come from the database
 * row, never from the request, so a crafted URL cannot walk out of media/.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string; variant: string } },
) {
  const variant = params.variant as Variant
  if (!VARIANTS.includes(variant)) {
    return NextResponse.json({ error: 'Unknown variant' }, { status: 404 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const relative =
    variant === 'thumb' ? asset.thumbPath : variant === 'proxy' ? asset.proxyPath : asset.storagePath
  if (!relative) return NextResponse.json({ error: 'Variant not available' }, { status: 404 })

  const filePath = toAbsolute(relative)
  const contentType =
    variant === 'thumb' ? 'image/jpeg' : variant === 'proxy' ? 'video/mp4' : asset.mimeType

  let size: number
  try {
    size = (await stat(filePath)).size
  } catch {
    return NextResponse.json({ error: 'File is missing from media/' }, { status: 410 })
  }

  const headers = new Headers({
    'content-type': contentType,
    'accept-ranges': 'bytes',
    // Media is immutable once ingested, so it can be cached hard by the browser.
    'cache-control': 'private, max-age=31536000, immutable',
  })

  // Range support: without it Safari refuses to play video at all.
  const range = request.headers.get('range')
  const match = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (match) {
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (Number.isNaN(start) || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
    headers.set('content-length', String(end - start + 1))
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
    return new Response(stream, { status: 206, headers })
  }

  headers.set('content-length', String(size))
  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { headers })
}
