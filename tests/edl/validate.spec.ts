import { describe, expect, it } from 'vitest'
import { validateEdl, type PlannedSegment, type PlannerAsset } from '@reelforge/shared'

function asset(overrides: Partial<PlannerAsset> & { id: string }): PlannerAsset {
  return {
    kind: 'photo',
    durationSec: null,
    consentCleared: true,
    hasIndianFlag: false,
    ...overrides,
  }
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

const assets = new Map<string, PlannerAsset>([
  ['p1', asset({ id: 'p1' })],
  ['p2', asset({ id: 'p2' })],
  ['flag', asset({ id: 'flag', hasIndianFlag: true })],
  ['uncleared', asset({ id: 'uncleared', consentCleared: false })],
  ['v1', asset({ id: 'v1', kind: 'video', durationSec: 12 })],
  ['short', asset({ id: 'short', kind: 'video', durationSec: 2 })],
])

const codes = (result: { issues: { code: string }[] }) => result.issues.map((i) => i.code)

describe('timeline', () => {
  it('places segments end to end with no gaps', () => {
    const result = validateEdl([segment('p1', 4), segment('p2', 6), segment('p1', 5)], {
      target: 'youtube_16x9',
      assets,
    })

    expect(result.segments.map((s) => [s.startSec, s.endSec])).toEqual([
      [0, 4],
      [4, 10],
      [10, 15],
    ])
    expect(result.totalSeconds).toBe(15)
    expect(result.ok).toBe(true)
  })

  it('derives trim out-points from the segment length', () => {
    const result = validateEdl([segment('v1', 4, { motion: 'trim', trimStartSec: 2 })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.segments[0]!.trimEndSec).toBe(6)
  })
})

describe('consent', () => {
  it('blocks an EDL that references an uncleared asset', () => {
    const result = validateEdl([segment('p1', 4), segment('uncleared', 4)], {
      target: 'youtube_16x9',
      assets,
    })

    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('consent_not_cleared')
    const issue = result.issues.find((i) => i.code === 'consent_not_cleared')!
    expect(issue.level).toBe('error')
    expect(issue.assetId).toBe('uncleared')
  })

  it('downgrades to a warning only when the filter is explicitly off', () => {
    const result = validateEdl([segment('uncleared', 4)], {
      target: 'youtube_16x9',
      assets,
      consentFilter: false,
    })
    expect(result.issues.find((i) => i.code === 'consent_not_cleared')!.level).toBe('warning')
    expect(result.ok).toBe(true)
  })
})

describe('Indian flag exclusions', () => {
  it('replaces any move on a flagged asset with a hold', () => {
    const result = validateEdl([segment('flag', 4, { motion: 'ken_burns_in' })], {
      target: 'youtube_16x9',
      assets,
    })

    expect(result.segments[0]!.motion).toBe('hold')
    expect(codes(result)).toContain('flag_motion_removed')
    // A correction, not a failure.
    expect(result.ok).toBe(true)
  })

  it('strips a caption that would be overlaid on a flagged asset', () => {
    const result = validateEdl([segment('flag', 4, { captionText: 'Independence Day' })], {
      target: 'youtube_16x9',
      assets,
    })

    expect(result.segments[0]!.captionText).toBeNull()
    expect(codes(result)).toContain('flag_caption_removed')
  })

  it('leaves unflagged assets alone', () => {
    const result = validateEdl([segment('p1', 4, { motion: 'pan_left', captionText: 'Hello' })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.segments[0]!.motion).toBe('pan_left')
    expect(result.segments[0]!.captionText).toBe('Hello')
  })
})

describe('motion corrections', () => {
  it('cannot trim a photograph', () => {
    const result = validateEdl([segment('p1', 4, { motion: 'trim', trimStartSec: 1 })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.segments[0]!.motion).toBe('hold')
    expect(codes(result)).toContain('photo_trim_corrected')
  })

  it('plays footage instead of ken-burnsing a video', () => {
    const result = validateEdl([segment('v1', 4, { motion: 'ken_burns_out' })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.segments[0]!.motion).toBe('trim')
    expect(codes(result)).toContain('video_motion_corrected')
  })
})

describe('hard limits', () => {
  it('rejects a shot below the minimum length', () => {
    const result = validateEdl([segment('p1', 0.6), segment('p2', 4)], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('segment_too_short')
  })

  it('rejects a caption that cannot be read in time', () => {
    // 1.0s is above nothing but below the 1.2s readability floor.
    const result = validateEdl([segment('p1', 1, { captionText: 'Too quick' })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('caption_too_short')
  })

  it('rejects a trim that runs past the end of the clip', () => {
    const result = validateEdl([segment('short', 4, { motion: 'trim', trimStartSec: 1 })], {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('trim_past_end')
  })

  it('rejects an unknown asset id', () => {
    const result = validateEdl([segment('ghost', 4)], { target: 'youtube_16x9', assets })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('unknown_asset')
  })

  it('rejects an empty edit', () => {
    const result = validateEdl([], { target: 'youtube_16x9', assets })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('empty')
  })
})

describe('duration contract', () => {
  it('accepts a vertical cut inside the tolerance', () => {
    const result = validateEdl(
      [segment('p1', 8), segment('p2', 8), segment('p1', 7), segment('p2', 7.3)],
      { target: 'portrait_9x16_30', assets },
    )
    expect(result.totalSeconds).toBe(30.3)
    expect(codes(result)).not.toContain('duration_off_target')
  })

  it('rejects a vertical cut outside the tolerance', () => {
    const result = validateEdl([segment('p1', 8), segment('p2', 8), segment('p1', 8)], {
      target: 'portrait_9x16_30',
      assets,
    })
    expect(result.ok).toBe(false)
    expect(codes(result)).toContain('duration_off_target')
  })

  it('lets the 16:9 cut run to the length of the script', () => {
    // No fixed target: a two-minute cut is fine here and would fail at 30s.
    const result = validateEdl(Array.from({ length: 20 }, () => segment('p1', 6)), {
      target: 'youtube_16x9',
      assets,
    })
    expect(result.totalSeconds).toBe(120)
    expect(result.ok).toBe(true)
  })
})

describe('planner response schema', () => {
  it('accepts a well-formed plan and fills the optional fields', async () => {
    const { planResponseSchema } = await import('@reelforge/shared')
    const parsed = planResponseSchema.parse({
      titleText: 'NeeRav Arts Village',
      segments: [{ assetId: 'p1', durationSec: 4, motion: 'hold' }],
    })
    expect(parsed.segments[0]!.captionText).toBeNull()
    expect(parsed.segments[0]!.trimStartSec).toBeNull()
  })

  it('rejects a motion the renderer cannot perform', async () => {
    const { planResponseSchema } = await import('@reelforge/shared')
    const result = planResponseSchema.safeParse({
      titleText: null,
      segments: [{ assetId: 'p1', durationSec: 4, motion: 'zoom_spin' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a zero or negative duration', async () => {
    const { planResponseSchema } = await import('@reelforge/shared')
    expect(
      planResponseSchema.safeParse({ titleText: null, segments: [{ assetId: 'p1', durationSec: 0, motion: 'hold' }] })
        .success,
    ).toBe(false)
  })

  it('rejects an empty edit', async () => {
    const { planResponseSchema } = await import('@reelforge/shared')
    expect(planResponseSchema.safeParse({ titleText: null, segments: [] }).success).toBe(false)
  })
})
