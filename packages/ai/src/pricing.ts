/**
 * Per-million-token prices, in US dollars, for the models ReelForge can be
 * pointed at. Used for the estimate shown before a batch runs and for the
 * actual cost recorded against a job.
 */
export interface ModelPrice {
  label: string
  inputPerMTok: number
  outputPerMTok: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { label: 'Claude Opus 5', inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { label: 'Claude Sonnet 5', inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5', inputPerMTok: 1, outputPerMTok: 5 },
  'claude-opus-4-8': { label: 'Claude Opus 4.8', inputPerMTok: 5, outputPerMTok: 25 },
  'claude-fable-5-1': { label: 'Claude Fable 5.1', inputPerMTok: 10, outputPerMTok: 50 },
}

/** Falls back to Opus pricing so an unknown model over-estimates rather than under. */
export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? { label: model, inputPerMTok: 5, outputPerMTok: 25 }
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model)
  return (inputTokens / 1e6) * price.inputPerMTok + (outputTokens / 1e6) * price.outputPerMTok
}

/**
 * Claude bills an image at roughly (width x height) / 750 tokens, and resizes
 * anything over 1568px on the long edge before doing so.
 */
export function imageTokens(width: number, height: number): number {
  const longEdge = Math.max(width, height)
  const scale = longEdge > 1568 ? 1568 / longEdge : 1
  return Math.ceil((width * scale * (height * scale)) / 750)
}
