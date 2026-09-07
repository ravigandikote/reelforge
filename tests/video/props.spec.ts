import { describe, expect, it } from 'vitest'
import { RENDER_FORMATS, RENDER_TARGETS } from '@reelforge/shared'
import { compositionId, renderPropsSchema } from '@reelforge/video/props'
import { samplePropsFor } from '@reelforge/video/sample'

describe('compositionId', () => {
  it('hyphenates every target, since Remotion ids allow no underscores', () => {
    for (const target of RENDER_TARGETS) {
      const id = compositionId(target)
      expect(id).not.toContain('_')
      expect(id).toMatch(/^[a-zA-Z0-9-]+$/)
    }
    expect(compositionId('portrait_9x16_30')).toBe('portrait-9x16-30')
  })

  it('keeps ids unique', () => {
    const ids = RENDER_TARGETS.map(compositionId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('renderPropsSchema', () => {
  it('fills the defaults a hand-written EDL can omit', () => {
    const props = renderPropsSchema.parse({
      target: 'portrait_9x16_30',
      segments: [
        { index: 0, startSec: 0, endSec: 4, assetId: 'a', motion: 'hold' },
      ],
      assets: [{ id: 'a', kind: 'photo', src: 'a.jpg', width: 1920, height: 1080 }],
      brand: {},
    })

    expect(props.assets[0]!.focalX).toBe(0.5)
    expect(props.assets[0]!.hasIndianFlag).toBe(false)
    expect(props.brand.indigo).toBe('#1A2A46')
    // Source audio stays off: the voiceover and music own the track.
    expect(props.muteSourceAudio).toBe(true)
  })

  it('rejects a focal point outside the frame', () => {
    const result = renderPropsSchema.safeParse({
      target: 'portrait_9x16_30',
      segments: [],
      assets: [{ id: 'a', kind: 'photo', src: 'a.jpg', width: 10, height: 10, focalX: 1.5, focalY: 0.5 }],
      brand: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown target', () => {
    expect(
      renderPropsSchema.safeParse({ target: 'square_1x1', segments: [], assets: [], brand: {} }).success,
    ).toBe(false)
  })
})

describe('sample EDL', () => {
  it('is continuous, so the composition has no gaps', () => {
    const props = samplePropsFor('portrait_9x16_30')
    let cursor = 0
    for (const segment of props.segments) {
      expect(segment.startSec).toBeCloseTo(cursor, 3)
      expect(segment.endSec).toBeGreaterThan(segment.startSec)
      cursor = segment.endSec
    }
    expect(cursor).toBeGreaterThan(0)
  })

  it('exercises every motion the renderer implements', () => {
    const motions = new Set(samplePropsFor('youtube_16x9').segments.map((s) => s.motion))
    expect(motions).toContain('ken_burns_in')
    expect(motions).toContain('ken_burns_out')
    expect(motions).toContain('pan_left')
    expect(motions).toContain('pan_right')
    expect(motions).toContain('hold')
    expect(motions).toContain('trim')
  })

  it('includes a flagged asset, which must carry no caption', () => {
    const props = samplePropsFor('portrait_9x16_30')
    const flagged = props.assets.filter((asset) => asset.hasIndianFlag)
    expect(flagged.length).toBeGreaterThan(0)

    for (const segment of props.segments) {
      const asset = props.assets.find((a) => a.id === segment.assetId)
      if (asset?.hasIndianFlag) {
        expect(segment.captionText).toBeNull()
        expect(segment.motion).toBe('hold')
      }
    }
  })

  it('fits inside each format it is offered to', () => {
    for (const target of RENDER_TARGETS) {
      const props = samplePropsFor(target)
      const total = props.segments.at(-1)!.endSec
      const format = RENDER_FORMATS[target]
      // The sample is a fixed hand-written edit, so it only has to be shorter
      // than the longest target — the planner is what hits exact durations.
      expect(total).toBeLessThanOrEqual(format.targetSeconds ?? 120)
    }
  })
})
