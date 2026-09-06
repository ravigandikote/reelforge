import { NextResponse } from 'next/server'
import { completeAuth } from '@reelforge/google'
import { getEnv } from '@reelforge/shared/env'
import { unsign } from '@/lib/signedCookie'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function back(message: string, ok: boolean) {
  const url = new URL('/settings', getEnv().APP_URL)
  url.searchParams.set(ok ? 'connected' : 'error', message)
  const response = NextResponse.redirect(url)
  response.cookies.delete('rf_pkce')
  response.cookies.delete('rf_state')
  return response
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const denied = params.get('error')
  if (denied) return back(`Google returned "${denied}"`, false)

  const code = params.get('code')
  const state = params.get('state')
  if (!code) return back('Google did not return an authorisation code', false)

  const cookies = request.headers.get('cookie') ?? ''
  const read = (name: string) =>
    cookies
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1)

  const codeVerifier = unsign(read('rf_pkce'))
  const expectedState = unsign(read('rf_state'))

  if (!codeVerifier) return back('The sign-in session expired — start again', false)
  if (!expectedState || expectedState !== state) {
    // A mismatch means the callback did not come from the flow we started.
    return back('State mismatch — the sign-in was not completed in this browser', false)
  }

  try {
    const account = await completeAuth(code, codeVerifier)
    return back(account.email, true)
  } catch (err) {
    return back(err instanceof Error ? err.message : 'Could not complete sign-in', false)
  }
}
