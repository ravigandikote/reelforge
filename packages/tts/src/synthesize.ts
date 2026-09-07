import { getEnv, requireEnv } from '@reelforge/shared/env'
import type { TimedWord } from '@reelforge/shared'
import { baseUrl } from './client.js'
import { wordsFromAlignment, type CharacterAlignment } from './words.js'

export interface SpeakInput {
  text: string
  /** Where this line sits on the film's timeline, so word timings come back absolute. */
  offsetSec: number
  segmentIndex: number
  voiceId?: string
}

export interface SpeakResult {
  audio: Buffer
  words: TimedWord[]
  /** Length of the generated speech, from the last character's end time. */
  durationSec: number
  characters: number
}

interface TimestampResponse {
  audio_base64: string
  alignment: CharacterAlignment | null
  normalized_alignment: CharacterAlignment | null
}

/**
 * One line of narration, with the character-level timings that make word-by-word
 * captions possible. Using the provider's own timestamps avoids a second
 * alignment pass (Whisper or similar) and cannot drift from the audio it
 * describes, because it is generated with it.
 */
export async function speak(input: SpeakInput): Promise<SpeakResult> {
  const env = getEnv()
  const voiceId = input.voiceId ?? env.ELEVENLABS_VOICE_ID
  if (!voiceId) {
    throw new Error('No ElevenLabs voice is set — choose one in Settings or set ELEVENLABS_VOICE_ID')
  }

  const response = await fetch(
    `${baseUrl()}/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': requireEnv('ELEVENLABS_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: env.ELEVENLABS_MODEL_ID,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          // A documentary read, not an excited one.
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`ElevenLabs error ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
  }

  const data = (await response.json()) as TimestampResponse
  if (!data.audio_base64) throw new Error('ElevenLabs returned no audio')

  // normalized_alignment matches the spoken text after ElevenLabs expands
  // numbers and abbreviations, which is what the listener actually hears.
  const alignment = data.normalized_alignment ?? data.alignment
  const words = alignment
    ? wordsFromAlignment(alignment, { offsetSec: input.offsetSec, segmentIndex: input.segmentIndex })
    : []

  const audio = Buffer.from(data.audio_base64, 'base64')
  const lastEnd = alignment?.character_end_times_seconds.at(-1) ?? 0

  return {
    audio,
    words,
    durationSec: Math.round(lastEnd * 1000) / 1000,
    characters: input.text.length,
  }
}

/** ElevenLabs bills per character, so the estimate is just the script length. */
export function characterCount(lines: string[]): number {
  return lines.reduce((sum, line) => sum + line.length, 0)
}
