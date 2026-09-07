import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { projectOptionsSchema } from '@reelforge/shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const parsed = projectOptionsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid project' },
      { status: 400 },
    )
  }

  const options = parsed.data
  const brandKit =
    options.brandKitId ?? (await prisma.brandKit.findFirst({ where: { isDefault: true } }))?.id ?? null

  const project = await prisma.project.create({
    data: {
      title: options.title,
      script: options.script,
      targetsJson: JSON.stringify(options.targets),
      voiceEnabled: options.voiceEnabled,
      voiceId: options.voiceId,
      consentFilter: options.consentFilter,
      brandKitId: brandKit,
      musicTrackId: options.musicTrackId,
    },
  })

  return NextResponse.json({ id: project.id })
}
