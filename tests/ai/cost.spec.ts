import { describe, expect, it } from 'vitest'

process.env.DATABASE_URL ??= 'file:./dev.db'
process.env.ANTHROPIC_VISION_MODEL = 'claude-opus-5'
process.env.ANTHROPIC_VISION_EFFORT = 'low'

const { costUsd, estimateAnalysis, imageTokens, priceFor, FRAMES_PER_VIDEO } = await import(
  '@reelforge/ai'
)

describe('imageTokens', () => {
  it('bills roughly width x height / 750', () => {
    expect(imageTokens(1024, 768)).toBe(Math.ceil((1024 * 768) / 750))
  })

  it('accounts for the 1568px downscale on huge images', () => {
    // A 4032x3024 phone photo is resized before billing, so it must not cost
    // 16x what a 1024px frame costs.
    expect(imageTokens(4032, 3024)).toBeLessThan(imageTokens(4032, 3024) * 0.5 + 3000)
    expect(imageTokens(4032, 3024)).toBeLessThan(2600)
  })
})

describe('costUsd', () => {
  it('prices a million input tokens at the model rate', () => {
    expect(costUsd('claude-opus-5', 1_000_000, 0)).toBeCloseTo(5, 6)
    expect(costUsd('claude-opus-5', 0, 1_000_000)).toBeCloseTo(25, 6)
    expect(costUsd('claude-sonnet-5', 1_000_000, 0)).toBeCloseTo(2, 6)
    expect(costUsd('claude-haiku-4-5', 0, 1_000_000)).toBeCloseTo(5, 6)
  })

  it('falls back to Opus pricing for an unknown model, so it over-estimates', () => {
    expect(priceFor('some-future-model').inputPerMTok).toBe(5)
  })
})

describe('estimateAnalysis', () => {
  const photo = { kind: 'photo', width: 1920, height: 1080 }
  const video = { kind: 'video', width: 1920, height: 1080 }

  it('counts photos and videos separately', () => {
    const estimate = estimateAnalysis([photo, photo, video])
    expect(estimate.assets).toBe(3)
    expect(estimate.photos).toBe(2)
    expect(estimate.videos).toBe(1)
  })

  it('charges a video for its sampled frames', () => {
    const one = estimateAnalysis([photo])
    const clip = estimateAnalysis([video])
    // Same pixels either way, so the image portion triples while the per-asset
    // prompt overhead is paid once. Solving the two estimates gives it exactly.
    const overhead = (FRAMES_PER_VIDEO * one.inputTokens - clip.inputTokens) / (FRAMES_PER_VIDEO - 1)
    expect(clip.inputTokens - overhead).toBeCloseTo(FRAMES_PER_VIDEO * (one.inputTokens - overhead), 6)
    expect(overhead).toBeGreaterThan(0)
    expect(clip.inputTokens).toBeGreaterThan(one.inputTokens * 2)
  })

  it('scales with pixel count, not just asset count', () => {
    const small = estimateAnalysis([{ kind: 'photo', width: 640, height: 480 }])
    const large = estimateAnalysis([{ kind: 'photo', width: 4032, height: 3024 }])
    expect(large.inputTokens).toBeGreaterThan(small.inputTokens)
  })

  it('is zero for an empty batch', () => {
    const estimate = estimateAnalysis([])
    expect(estimate.assets).toBe(0)
    expect(estimate.usd).toBe(0)
  })

  it('reports the model and effort actually configured', () => {
    const estimate = estimateAnalysis([photo])
    expect(estimate.model).toBe('claude-opus-5')
    expect(estimate.modelLabel).toBe('Claude Opus 5')
    expect(estimate.effort).toBe('low')
    expect(estimate.usd).toBeGreaterThan(0)
  })

  it('keeps a realistic library affordable', () => {
    // 200 stills and 40 clips — a typical festival weekend.
    const assets = [
      ...Array.from({ length: 200 }, () => ({ kind: 'photo', width: 4032, height: 3024 })),
      ...Array.from({ length: 40 }, () => ({ kind: 'video', width: 1920, height: 1080 })),
    ]
    const estimate = estimateAnalysis(assets)
    expect(estimate.usd).toBeGreaterThan(0)
    expect(estimate.usd).toBeLessThan(10)
  })
})
