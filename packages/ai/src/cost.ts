import { getEnv } from '@reelforge/shared/env'
import { costUsd, imageTokens, priceFor } from './pricing.js'
import { visionModel } from './client.js'

/** Frames sent per video. Kept in step with visionFrames() in @reelforge/media. */
export const FRAMES_PER_VIDEO = 3

/** Measured overhead of the system prompt plus the tool schema, in tokens. */
const PROMPT_OVERHEAD_TOKENS = 620
/** A catalogue entry is short; this is a deliberate over-estimate. */
const OUTPUT_TOKENS_PER_ASSET = 260

export interface EstimateInput {
  kind: string
  width: number
  height: number
}

export interface CostEstimate {
  model: string
  modelLabel: string
  assets: number
  photos: number
  videos: number
  inputTokens: number
  outputTokens: number
  /** Deliberately the ceiling: caching and short answers usually beat it. */
  usd: number
  inputPerMTok: number
  outputPerMTok: number
  effort: string
}

/**
 * What a batch will cost before it runs. Computed from the actual pixel
 * dimensions of what would be sent, not a flat per-asset guess, because a wall
 * of 4K stills costs several times what a wall of phone snaps does.
 */
export function estimateAnalysis(assets: EstimateInput[]): CostEstimate {
  const model = visionModel()
  const price = priceFor(model)

  let inputTokens = 0
  let photos = 0
  let videos = 0

  for (const asset of assets) {
    const isVideo = asset.kind === 'video'
    if (isVideo) videos += 1
    else photos += 1

    // Frames are downscaled to VISION_MAX_EDGE before sending.
    const scale = Math.min(1, 1024 / Math.max(asset.width, asset.height, 1))
    const perImage = imageTokens(Math.round(asset.width * scale), Math.round(asset.height * scale))
    inputTokens += perImage * (isVideo ? FRAMES_PER_VIDEO : 1) + PROMPT_OVERHEAD_TOKENS
  }

  const outputTokens = assets.length * OUTPUT_TOKENS_PER_ASSET

  return {
    model,
    modelLabel: price.label,
    assets: assets.length,
    photos,
    videos,
    inputTokens,
    outputTokens,
    usd: costUsd(model, inputTokens, outputTokens),
    inputPerMTok: price.inputPerMTok,
    outputPerMTok: price.outputPerMTok,
    effort: getEnv().ANTHROPIC_VISION_EFFORT,
  }
}
