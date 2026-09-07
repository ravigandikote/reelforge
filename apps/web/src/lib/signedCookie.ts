import { createHmac, timingSafeEqual } from 'node:crypto'
import { getEnv } from '@reelforge/shared/env'

/**
 * Tiny signed-cookie helper for the OAuth handshake. The PKCE verifier and the
 * state token live here between the redirect to Google and the callback; the
 * signature stops a tampered cookie from feeding us someone else's verifier.
 */
function secret(): string {
  const value = getEnv().SESSION_SECRET
  if (!value) throw new Error('SESSION_SECRET is not set — run `pnpm bootstrap`')
  return value
}

export function sign(value: string): string {
  const mac = createHmac('sha256', secret()).update(value).digest('base64url')
  return `${Buffer.from(value).toString('base64url')}.${mac}`
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null
  const [encoded, mac] = signed.split('.')
  if (!encoded || !mac) return null

  const value = Buffer.from(encoded, 'base64url').toString()
  const expected = createHmac('sha256', secret()).update(value).digest('base64url')

  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return value
}
