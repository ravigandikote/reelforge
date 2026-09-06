import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: { events: { orderBy: { createdAt: 'asc' }, take: 200 } },
  })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json(job)
}
