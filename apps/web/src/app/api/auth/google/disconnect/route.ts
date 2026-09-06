import { NextResponse } from 'next/server'
import { connectedAccount, disconnectAccount } from '@reelforge/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const account = await connectedAccount()
  if (!account) return NextResponse.json({ ok: true })

  await disconnectAccount(account.id)
  return NextResponse.json({ ok: true, email: account.email })
}
