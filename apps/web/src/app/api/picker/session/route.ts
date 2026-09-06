import { NextResponse } from 'next/server'
import { connectedAccount, createSession, isGoogleConfigured } from '@reelforge/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Starts a Google Photos Picker session. The response carries the pickerUri the
 * user opens to choose albums or items; nothing is readable until they do.
 */
export async function POST() {
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: 'Google is not configured — see the README' }, { status: 400 })
  }

  const account = await connectedAccount()
  if (!account) {
    return NextResponse.json({ error: 'Connect a Google account first' }, { status: 401 })
  }

  try {
    const session = await createSession(account.id)
    return NextResponse.json({ ...session, accountEmail: account.email })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not start a picker session' },
      { status: 502 },
    )
  }
}
