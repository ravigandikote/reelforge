import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { isTtsConfigured } from '@reelforge/tts'
import { createJob, enqueue } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const edl = await prisma.edl.findUnique({
    where: { id: params.id },
    include: { project: true, segments: { select: { voiceoverText: true } } },
  })
  if (!edl) return NextResponse.json({ error: 'Cut not found' }, { status: 404 })

  // Captions can be timed from the edit without a key; narration cannot.
  if (edl.project.voiceEnabled && !isTtsConfigured()) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY is not set — add it to .env and restart, or turn voiceover off' },
      { status: 400 },
    )
  }

  const job = await createJob({
    type: 'tts',
    projectId: edl.projectId,
    target: edl.target,
    message: 'Queued voiceover and captions',
  })
  await enqueue('tts', 'voice', { jobId: job.id, edlId: edl.id })

  return NextResponse.json({ jobId: job.id })
}
