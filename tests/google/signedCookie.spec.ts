import { beforeAll, describe, expect, it } from 'vitest'

// The helper reads SESSION_SECRET through the shared env parser at call time.
process.env.SESSION_SECRET = 'test-secret-for-cookie-signing'
process.env.DATABASE_URL ??= 'file:./dev.db'

const { sign, unsign } = await import('../../apps/web/src/lib/signedCookie')

describe('signed OAuth cookies', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-secret-for-cookie-signing'
  })

  it('round-trips a PKCE verifier', () => {
    const verifier = 'abc123~verifier_value-XYZ'
    expect(unsign(sign(verifier))).toBe(verifier)
  })

  it('rejects a tampered value', () => {
    const signed = sign('original')
    const [, mac] = signed.split('.')
    const forged = `${Buffer.from('attacker').toString('base64url')}.${mac}`
    expect(unsign(forged)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const [encoded] = sign('original').split('.')
    expect(unsign(`${encoded}.not-a-real-mac`)).toBeNull()
  })

  it('rejects missing or malformed cookies', () => {
    expect(unsign(undefined)).toBeNull()
    expect(unsign('')).toBeNull()
    expect(unsign('no-dot-here')).toBeNull()
  })
})
