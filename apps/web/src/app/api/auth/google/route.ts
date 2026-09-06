import { NextResponse } from 'next/server'
import { buildAuthUrl, isGoogleConfigured } from '@reelforge/google'
import { sign } from '@/lib/signedCookie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        error:
          'Google is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env — see the README for the console steps.',
      },
      { status: 400 },
    )
  }

  const { url, codeVerifier, state } = await buildAuthUrl()
  const response = NextResponse.redirect(url)

  // Ten minutes is plenty for a consent screen and keeps a stale verifier from
  // lingering in the browser.
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  }
  response.cookies.set('rf_pkce', sign(codeVerifier), options)
  response.cookies.set('rf_state', sign(state), options)

  return response
}
