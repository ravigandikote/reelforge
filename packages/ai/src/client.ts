import Anthropic from '@anthropic-ai/sdk'
import { getEnv, requireEnv } from '@reelforge/shared/env'

let cached: Anthropic | null = null

export function anthropic(): Anthropic {
  const env = getEnv()
  cached ??= new Anthropic({
    apiKey: requireEnv('ANTHROPIC_API_KEY'),
    // Optional: an internal gateway or, in tests, a local stand-in.
    ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}),
  })
  return cached
}

export function isAiConfigured(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY)
}

export function visionModel(): string {
  return getEnv().ANTHROPIC_VISION_MODEL
}

export function planningModel(): string {
  return getEnv().ANTHROPIC_PLANNING_MODEL
}
