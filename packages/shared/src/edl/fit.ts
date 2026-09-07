import { MAX_SEGMENT_SEC, MIN_SEGMENT_SEC } from '../constants/formats.js'
import { round, totalDuration } from './place.js'
import type { PlannedSegment, PlannerAsset } from './types.js'

export interface SegmentBounds {
  min: number
  max: number
}

/**
 * How far a segment may stretch or shrink. A still can hold for as long as the
 * edit allows; a clip cannot run past the end of its own footage.
 */
export function boundsFor(
  segment: PlannedSegment,
  asset: PlannerAsset | undefined,
): SegmentBounds {
  const min = MIN_SEGMENT_SEC
  if (!asset || asset.kind === 'photo' || !asset.durationSec) {
    return { min, max: MAX_SEGMENT_SEC }
  }

  const available = round(asset.durationSec - (segment.trimStartSec ?? 0))
  return { min, max: Math.max(min, Math.min(MAX_SEGMENT_SEC, available)) }
}

/**
 * Clamps every segment to what its asset can support, without retiming the edit.
 * Used for the 16:9 cut, which has no target duration but must still not ask a
 * four-second clip to play for four and a half.
 */
export function clampSegments(
  segments: PlannedSegment[],
  assets: Map<string, PlannerAsset>,
): { segments: PlannedSegment[]; notes: string[] } {
  const notes: string[] = []

  const clamped = segments.map((segment, index) => {
    const bounds = boundsFor(segment, assets.get(segment.assetId))
    const durationSec = round(Math.min(bounds.max, Math.max(bounds.min, segment.durationSec)))
    if (Math.abs(durationSec - segment.durationSec) > 0.001) {
      notes.push(
        `Segment ${index + 1} shortened from ${segment.durationSec}s to ${durationSec}s to fit its footage`,
      )
    }
    return { ...segment, durationSec }
  })

  return { segments: clamped, notes }
}

export interface FitResult {
  segments: PlannedSegment[]
  totalSeconds: number
  /** True when the result lands inside the caller's tolerance. */
  fitted: boolean
  /** What had to change, for the job log. */
  notes: string[]
}

/**
 * Scales a planned edit onto its target duration.
 *
 * The model is asked for a cut of roughly the right length, not an exact one —
 * telling it to hit 30.000s produces worse edits than telling it to hit "about
 * 30" and then fixing the arithmetic here. Segments are scaled proportionally,
 * clamped to what each asset can actually support, and the leftover is
 * redistributed across whatever still has room.
 */
export function fitDuration(
  segments: PlannedSegment[],
  targetSeconds: number,
  assets: Map<string, PlannerAsset>,
  toleranceSec: number,
): FitResult {
  const notes: string[] = []
  if (segments.length === 0) {
    return { segments, totalSeconds: 0, fitted: false, notes: ['The edit has no segments'] }
  }

  const bounds = segments.map((segment) => boundsFor(segment, assets.get(segment.assetId)))
  const floor = bounds.reduce((sum, b) => sum + b.min, 0)
  const ceiling = bounds.reduce((sum, b) => sum + b.max, 0)

  if (targetSeconds < floor - toleranceSec) {
    notes.push(
      `${segments.length} segments cannot fit ${targetSeconds}s — even at the ${MIN_SEGMENT_SEC}s minimum they run ${round(floor)}s`,
    )
  }
  if (targetSeconds > ceiling + toleranceSec) {
    notes.push(
      `${segments.length} segments cannot fill ${targetSeconds}s — stretched as far as the footage allows they reach ${round(ceiling)}s`,
    )
  }

  let durations = segments.map((segment) => segment.durationSec)
  const initial = totalDuration(segments)

  // Scale, clamp, then push the remainder into whatever still has headroom.
  // Two or three passes settle it; the loop bound is only there so a pathological
  // input cannot spin.
  for (let pass = 0; pass < 8; pass++) {
    const current = durations.reduce((sum, value) => sum + value, 0)
    const drift = targetSeconds - current
    if (Math.abs(drift) <= 0.001) break

    const scale = current > 0 ? targetSeconds / current : 1
    durations = durations.map((value, index) => {
      const b = bounds[index]!
      return Math.min(b.max, Math.max(b.min, value * scale))
    })

    const afterScale = durations.reduce((sum, value) => sum + value, 0)
    const remainder = targetSeconds - afterScale
    if (Math.abs(remainder) <= 0.001) break

    // Headroom in the direction we still need to move.
    const headroom = durations.map((value, index) => {
      const b = bounds[index]!
      return remainder > 0 ? b.max - value : value - b.min
    })
    const available = headroom.reduce((sum, value) => sum + value, 0)
    if (available <= 0.001) break

    durations = durations.map(
      (value, index) => value + (remainder * headroom[index]!) / available,
    )
  }

  // Rounding to milliseconds leaves a few thousandths on the table; put the
  // remainder into the last segment with room so the total lands exactly.
  const rounded = durations.map(round)
  const residual = round(targetSeconds - rounded.reduce((sum, value) => sum + value, 0))
  if (Math.abs(residual) > 0.0005) {
    for (let index = rounded.length - 1; index >= 0; index--) {
      const b = bounds[index]!
      const adjusted = round(rounded[index]! + residual)
      if (adjusted >= b.min - 0.0005 && adjusted <= b.max + 0.0005) {
        rounded[index] = adjusted
        break
      }
    }
  }

  const fitted = segments.map((segment, index) => ({
    ...segment,
    durationSec: rounded[index]!,
  }))
  const totalSeconds = totalDuration(fitted)

  if (Math.abs(totalSeconds - initial) > 0.05) {
    notes.push(`Retimed from ${initial}s to ${totalSeconds}s to hit the ${targetSeconds}s target`)
  }

  return {
    segments: fitted,
    totalSeconds,
    fitted: Math.abs(totalSeconds - targetSeconds) <= toleranceSec,
    notes,
  }
}
