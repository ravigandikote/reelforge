import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '@reelforge/db'

describe('token encryption', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  it('round-trips a Google refresh token', () => {
    const token = '1//0eXaMpLe-refresh-token'
    expect(decryptSecret(encryptSecret(token))).toBe(token)
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('refuses tampered ciphertext', () => {
    const payload = Buffer.from(encryptSecret('secret'), 'base64')
    payload[payload.length - 1] ^= 0xff
    expect(() => decryptSecret(payload.toString('base64'))).toThrow()
  })

  it('rejects a key that is not 32 bytes', () => {
    const good = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = Buffer.from('too-short').toString('base64')
    expect(() => encryptSecret('x')).toThrow(/32 bytes/)
    process.env.ENCRYPTION_KEY = good
  })
})
