import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { toAbsolute } from '@reelforge/media/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VARIANTS = ['video', 'thumb', 'srt', 'vtt'] as const
type Variant = (typeof VARIANTS)[number]

const CONTENT_TYPES: Record<Variant, string> = {
  video: 'video/mp4',
  thumb: 'image/jpeg',
  srt: 'application/x-subrip; charset=utf-8',
  vtt: 'text/vtt; charset=utf-8',
}

/** Serves a finished render's files by id, with Range support for the player. */
export async function GET(
  request: Request,
  { params }: { params: { id: string; variant: string } },
) {
  const variant = params.variant as Variant
  if (!VARIANTS.includes(variant)) {
    return NextResponse.json({ error: 'Unknown variant' }, { status: 404 })
  }

  const render = await prisma.render.findUnique({ where: { id: params.id } })
  if (!render) return NextResponse.json({ error: 'Render not found' }, { status: 404 })

  const relative =
    variant === 'video'
      ? render.videoPath
      : variant === 'thumb'
        ? render.thumbPath
        : variant === 'srt'
          ? render.srtPath
          : render.vttPath

  if (!relative) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  const filePath = toAbsolute(relative)
  let size: number
  try {
    size = (await stat(filePath)).size
  } catch {
    return NextResponse.json({ error: 'The file is missing from renders/' }, { status: 410 })
  }

  const download = new URL(request.url).searchParams.has('download')
  const headers = new Headers({
    'content-type': CONTENT_TYPES[variant],
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  })
  if (download || variant === 'srt' || variant === 'vtt') {
    headers.set(
      'content-disposition',
      `attachment; filename="${render.target}.${variant === 'video' ? 'mp4' : variant === 'thumb' ? 'jpg' : variant}"`,
    )
  }

  const range = request.headers.get('range')
  const match = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (match && variant === 'video') {
    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (Number.isNaN(start) || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream, {
      status: 206,
      headers,
    })
  }

  headers.set('content-length', String(size))
  return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, { headers })
}
