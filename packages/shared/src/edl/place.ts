import type { PlannedSegment, TimedSegment } from './types.js'

/**
 * Turns a list of durations into a timeline. The planner is asked for segment
 * lengths rather than absolute start/end times: a model doing running arithmetic
 * over twenty segments will eventually produce a gap or an overlap, and there is
 * no reason to let it try when the cumulative sum is exact here.
 */
export function place(segments: PlannedSegment[]): TimedSegment[] {
  let cursor = 0

  return segments.map((segment, index) => {
    const startSec = round(cursor)
    const endSec = round(cursor + segment.durationSec)
    cursor = endSec

    return {
      ...segment,
      index,
      startSec,
      endSec,
      durationSec: round(endSec - startSec),
      trimStartSec: segment.trimStartSec,
      trimEndSec:
        segment.trimStartSec === null ? null : round(segment.trimStartSec + (endSec - startSec)),
    }
  })
}

/** Milliseconds are the finest unit anything downstream cares about. */
export function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

export function totalDuration(segments: { durationSec: number }[]): number {
  return round(segments.reduce((sum, segment) => sum + segment.durationSec, 0))
}
