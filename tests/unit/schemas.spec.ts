import { describe, expect, it } from 'vitest'
import { edlSchema, projectOptionsSchema } from '@reelforge/shared'

const segment = {
  index: 0,
  startSec: 0,
  endSec: 4,
  assetId: 'asset_1',
  motion: 'ken_burns_in' as const,
}

describe('edlSchema', () => {
  it('accepts a well-formed segment and fills the optional fields', () => {
    const parsed = edlSchema.parse({ target: 'portrait_9x16_30', segments: [segment] })
    expect(parsed.segments[0]?.captionText).toBeNull()
    expect(parsed.titleText).toBeNull()
  })

  it('rejects a segment that ends before it starts', () => {
    const result = edlSchema.safeParse({
      target: 'portrait_9x16_30',
      segments: [{ ...segment, startSec: 5, endSec: 2 }],
    })
    expect(result.success).toBe(false)
  })

  it('requires trim points when the motion is a video trim', () => {
    const result = edlSchema.safeParse({
      target: 'youtube_16x9',
      segments: [{ ...segment, motion: 'trim' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown render target', () => {
    expect(edlSchema.safeParse({ target: 'square_1x1', segments: [segment] }).success).toBe(false)
  })
})

describe('projectOptionsSchema', () => {
  it('defaults the consent filter on', () => {
    const parsed = projectOptionsSchema.parse({
      title: 'Bonfire evening',
      script: 'A short film about an evening of music by the lake at NeeRav.',
      targets: ['portrait_9x16_30'],
    })
    expect(parsed.consentFilter).toBe(true)
    expect(parsed.voiceEnabled).toBe(true)
  })
})
