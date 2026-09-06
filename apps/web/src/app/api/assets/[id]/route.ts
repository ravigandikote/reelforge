import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@reelforge/db'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  consentCleared: z.boolean().optional(),
  hasIndianFlag: z.boolean().optional(),
  excluded: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const asset = await prisma.asset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const updated = await prisma.asset.update({ where: { id: params.id }, data: parsed.data })
  return NextResponse.json(updated)
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: { tags: { include: { tag: true } } },
  })
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
  return NextResponse.json(asset)
}
