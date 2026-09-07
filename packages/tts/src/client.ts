import { getEnv, requireEnv } from '@reelforge/shared/env'

const DEFAULT_BASE_URL = 'https://api.elevenlabs.io'

export function isTtsConfigured(): boolean {
  return Boolean(getEnv().ELEVENLABS_API_KEY)
}

export function baseUrl(): string {
  return getEnv().ELEVENLABS_BASE_URL ?? DEFAULT_BASE_URL
}

export async function elevenLabs<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'xi-api-key': requireEnv('ELEVENLABS_API_KEY'),
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(describeError(response.status, body))
  }

  return (await response.json()) as T
}

function describeError(status: number, body: string): string {
  if (status === 401) return 'ElevenLabs rejected the API key — check ELEVENLABS_API_KEY in .env.'
  if (status === 402) return 'The ElevenLabs account is out of characters for this billing period.'
  if (status === 422) {
    return `ElevenLabs could not use that request: ${body.slice(0, 200)}. A missing or unknown voice id is the usual cause.`
  }
  if (status === 429) return 'ElevenLabs is rate limiting — the batch will need to run more slowly.'
  return `ElevenLabs error ${status}${body ? `: ${body.slice(0, 200)}` : ''}`
}
