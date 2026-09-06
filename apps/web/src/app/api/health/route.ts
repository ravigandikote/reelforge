import { NextResponse } from 'next/server'
import { prisma } from '@reelforge/db'
import { redisReachable } from '@/lib/queue'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [db, redis] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
    redisReachable(),
  ])

  const ok = db && redis
  return NextResponse.json({ ok, db, redis, at: new Date().toISOString() }, { status: ok ? 200 : 503 })
}
