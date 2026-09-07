import { describe, expect, it } from 'vitest'
import {
  DURATION_TOLERANCE_SEC,
  MAX_SEGMENT_SEC,
  MIN_SEGMENT_SEC,
  boundsFor,
  clampSegments,
  fitDuration,
  type PlannedSegment,
  type PlannerAsset,
} from '@reelforge/shared'

function photo(id: string): PlannerAsset {
  return { id, kind: 'photo', durationSec: null, consentCleared: true, hasIndianFlag: false }
}
function clip(id: string, durationSec: number): PlannerAsset {
  return { id, kind: 'video', durationSec, consentCleared: true, hasIndianFlag: false }
}
function segment(assetId: string, durationSec: number, extra: Partial<PlannedSegment> = {}): PlannedSegment {
  return {
    assetId,
    durationSec,
    motion: 'hold',
    trimStartSec: null,
    captionText: null,
    voiceoverText: null,
    ...extra,
  }
}

const library = new Map<string, PlannerAsset>([
  ['p1', photo('p1')],
  ['p2', photo('p2')],
  ['p3', photo('p3')],
  ['v1', clip('v1', 12)],
  ['v2', clip('v2', 3)],
])

describe('boundsFor', () => {
  it('lets a still hold up to the maximum shot length', () => {
    expect(boundsFor(segment('p1', 4), photo('p1'))).toEqual({
      min: MIN_SEGMENT_SEC,
      max: MAX_SEGMENT_SEC,
    })
  })

  it('caps a clip at the footage left after its in-point', () => {
    const bounds = boundsFor(segment('v2', 3, { trimStartSec: 1 }), clip('v2', 3))
    // 3s clip, entered at 1s, so only 2s of footage remains.
    expect(bounds.max).toBeCloseTo(2, 3)
  })

  it('never returns a max below the minimum shot length', () => {
    const bounds = boundsFor(segment('v2', 3, { trimStartSec: 2.9 }), clip('v2', 3))
    expect(bounds.max).toBeGreaterThanOrEqual(bounds.min)
  })
})

describe('fitDuration', () => {
  it('scales a long edit down onto its target', () => {
    const planned = [segment('p1', 8), segment('p2', 8), segment('p3', 8), segment('v1', 8)]
    const result = fitDuration(planned, 30, library, DURATION_TOLERANCE_SEC)

    expect(result.fitted).toBe(true)
    expect(result.totalSeconds).toBeCloseTo(30, 1)
    expect(Math.abs(result.totalSeconds - 30)).toBeLessThanOrEqual(DURATION_TOLERANCE_SEC)
  })

  it('scales a short edit up onto its target', () => {
    const planned = [segment('p1', 2), segment('p2', 2), segment('p3', 2), segment('p1', 2)]
    const result = fitDuration(planned, 30, library, DURATION_TOLERANCE_SEC)
    expect(result.fitted).toBe(true)
    expect(result.totalSeconds).toBeCloseTo(30, 1)
  })

  it('never stretches a clip past the end of its own footage', () => {
    // v2 is 3s long, so it cannot carry a 10s slot no matter the target.
    const planned = [segment('v2', 3, { motion: 'trim', trimStartSec: 0 }), segment('p1', 3)]
    const result = fitDuration(planned, 20, library, DURATION_TOLERANCE_SEC)

    const clipSegment = result.segments[0]!
    expect(clipSegment.durationSec).toBeLessThanOrEqual(3.001)
  })

  it('keeps every segment at or above the minimum shot length', () => {
    const planned = Array.from({ length: 10 }, () => segment('p1', 3))
    const result = fitDuration(planned, 15, library, DURATION_TOLERANCE_SEC)
    for (const s of result.segments) {
      expect(s.durationSec).toBeGreaterThanOrEqual(MIN_SEGMENT_SEC - 0.001)
    }
  })

  it('reports when the target is unreachable instead of pretending', () => {
    // Two 1.2s-minimum segments cannot be squeezed into 1s.
    const planned = [segment('p1', 4), segment('p2', 4)]
    const result = fitDuration(planned, 1, library, DURATION_TOLERANCE_SEC)
    expect(result.fitted).toBe(false)
    expect(result.notes.join(' ')).toMatch(/cannot fit/)
  })

  it('reports when there is not enough footage to fill the target', () => {
    const planned = [segment('v2', 3, { motion: 'trim', trimStartSec: 0 })]
    const result = fitDuration(planned, 60, library, DURATION_TOLERANCE_SEC)
    expect(result.fitted).toBe(false)
    expect(result.notes.join(' ')).toMatch(/cannot fill/)
  })

  it('hits 30, 60 and 90 from the same starting edit', () => {
    const planned = Array.from({ length: 14 }, (_, i) => segment(i % 2 ? 'p1' : 'p2', 5))
    for (const target of [30, 60, 90]) {
      const result = fitDuration(planned, target, library, DURATION_TOLERANCE_SEC)
      expect(Math.abs(result.totalSeconds - target)).toBeLessThanOrEqual(DURATION_TOLERANCE_SEC)
    }
  })

  it('handles an empty edit without dividing by zero', () => {
    const result = fitDuration([], 30, library, DURATION_TOLERANCE_SEC)
    expect(result.fitted).toBe(false)
    expect(result.totalSeconds).toBe(0)
  })
})

describe('clampSegments', () => {
  it('shortens a segment that outruns its clip, without retiming the rest', () => {
    const planned = [segment('v2', 4.5, { motion: 'trim', trimStartSec: 0 }), segment('p1', 5)]
    const { segments, notes } = clampSegments(planned, library)

    // v2 is a 3s clip: 4.5s of it does not exist.
    expect(segments[0]!.durationSec).toBe(3)
    expect(segments[1]!.durationSec).toBe(5)
    expect(notes.join(' ')).toMatch(/Segment 1 shortened/)
  })

  it('leaves a valid edit untouched', () => {
    const planned = [segment('p1', 4), segment('v1', 6, { motion: 'trim', trimStartSec: 2 })]
    const { segments, notes } = clampSegments(planned, library)
    expect(segments.map((s) => s.durationSec)).toEqual([4, 6])
    expect(notes).toEqual([])
  })
})

describe('exact landing', () => {
  it('lands exactly on the target, not merely within tolerance', () => {
    // 14 stills: enough to stretch to 90s (max 8s each) and to compress to 30s
    // (min 1.2s each), so all three targets are actually reachable.
    const planned = Array.from({ length: 14 }, () => segment('p1', 4.5))
    for (const target of [30, 60, 90]) {
      const result = fitDuration(planned, target, library, DURATION_TOLERANCE_SEC)
      expect(result.totalSeconds).toBe(target)
    }
  })
})
