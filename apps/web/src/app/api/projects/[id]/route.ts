import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The EDLs for a project, newest version per target — the JSON viewer's source. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      edls: {
        orderBy: [{ target: 'asc' }, { version: 'desc' }],
        include: { segments: { orderBy: { index: 'asc' } } },
      },
    },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  return NextResponse.json(project)
}
