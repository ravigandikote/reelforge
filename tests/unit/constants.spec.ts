import { describe, expect, it } from 'vitest'
import {
  DURATION_TOLERANCE_SEC,
  MIN_CAPTION_SEC,
  RENDER_FORMATS,
  RENDER_TARGETS,
  SAFE_ZONES,
  TAG_VOCABULARY,
} from '@reelforge/shared'

describe('render formats', () => {
  it('defines a format and a safe zone for every target', () => {
    for (const target of RENDER_TARGETS) {
      expect(RENDER_FORMATS[target]).toBeDefined()
      expect(SAFE_ZONES[target]).toBeDefined()
    }
  })

  it('uses 1920x1080 for YouTube and 1080x1920 for every vertical cut', () => {
    expect(RENDER_FORMATS.youtube_16x9.width).toBe(1920)
    expect(RENDER_FORMATS.youtube_16x9.height).toBe(1080)
    for (const target of RENDER_TARGETS.filter((t) => t.startsWith('portrait'))) {
      expect(RENDER_FORMATS[target].width).toBe(1080)
      expect(RENDER_FORMATS[target].height).toBe(1920)
    }
  })

  it('keeps the vertical caption band clear of the platform UI', () => {
    for (const target of RENDER_TARGETS.filter((t) => t.startsWith('portrait'))) {
      const zone = SAFE_ZONES[target]
      // Captions sit in the lower-middle third, above the Reels/Shorts action bar.
      expect(zone.captionBand.top).toBeGreaterThan(0.5)
      expect(zone.captionBand.bottom).toBeLessThanOrEqual(1 - zone.bottom)
    }
  })

  it('holds the brief’s hard limits', () => {
    expect(DURATION_TOLERANCE_SEC).toBe(0.5)
    expect(MIN_CAPTION_SEC).toBe(1.2)
  })
})

describe('tag vocabulary', () => {
  it('has unique slugs', () => {
    const slugs = TAG_VOCABULARY.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('carries the governance tags the render gate depends on', () => {
    const slugs = TAG_VOCABULARY.map((t) => t.slug)
    expect(slugs).toContain('cleared')
    expect(slugs).toContain('indian_flag')
  })
})
