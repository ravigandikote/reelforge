import { elevenLabs } from './client.js'

export interface Voice {
  id: string
  name: string
  /** e.g. "indian", "american" — ElevenLabs' own label, when it has one. */
  accent: string | null
  description: string | null
  previewUrl: string | null
}

interface RawVoice {
  voice_id: string
  name: string
  preview_url?: string
  description?: string
  labels?: Record<string, string>
}

/** The voices the account can use, for the picker in Settings. */
export async function listVoices(): Promise<Voice[]> {
  const data = await elevenLabs<{ voices: RawVoice[] }>('/v1/voices')

  return (data.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name,
    accent: voice.labels?.accent ?? null,
    description: voice.description ?? voice.labels?.description ?? null,
    previewUrl: voice.preview_url ?? null,
  }))
}
