import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { toAbsolute } from '@reelforge/media/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Serves the subtitle files an EDL's voiceover pass produced. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const format = new URL(request.url).searchParams.get('format') === 'vtt' ? 'vtt' : 'srt'

  const edl = await prisma.edl.findUnique({ where: { id: params.id } })
  if (!edl) return NextResponse.json({ error: 'Cut not found' }, { status: 404 })

  const relative = format === 'vtt' ? edl.vttPath : edl.srtPath
  if (!relative) {
    return NextResponse.json({ error: 'No captions yet — run the voiceover step' }, { status: 404 })
  }

  try {
    const body = await readFile(toAbsolute(relative), 'utf8')
    return new Response(body, {
      headers: {
        'content-type': format === 'vtt' ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8',
        'content-disposition': `attachment; filename="${edl.target}.${format}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'The caption file is missing from renders/' }, { status: 410 })
  }
}
