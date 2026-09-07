import {
  DURATION_TOLERANCE_SEC,
  MIN_CAPTION_SEC,
  MIN_SEGMENT_SEC,
  RENDER_FORMATS,
  type RenderTarget,
} from '../constants/formats.js'
import { place, round, totalDuration } from './place.js'
import type { EdlIssue, PlannedSegment, PlannerAsset, TimedSegment, ValidationResult } from './types.js'

export interface ValidateOptions {
  target: RenderTarget
  assets: Map<string, PlannerAsset>
  /** Overrides the format's own target; used for the script-length 16:9 cut. */
  targetSeconds?: number | null
  /** When on, an uncleared asset is an error rather than a warning. */
  consentFilter?: boolean
}

/**
 * The gate every EDL passes before it can be stored or rendered.
 *
 * Some of these rules are also in the planner's prompt, but a prompt is a
 * request and this is enforcement: consent, the Indian-flag exclusions and the
 * duration contract are checked here so no model output can bypass them. Where a
 * violation has one obvious safe correction (a flagged asset given a pan) the
 * segment is corrected and a warning recorded, rather than failing the batch.
 */
export function validateEdl(
  planned: PlannedSegment[],
  options: ValidateOptions,
): ValidationResult {
  const issues: EdlIssue[] = []
  const format = RENDER_FORMATS[options.target]
  const targetSeconds =
    options.targetSeconds === undefined ? format.targetSeconds : options.targetSeconds

  const corrected = planned.map((segment, index) =>
    correctSegment(segment, index, options, issues),
  )
  const segments = place(corrected)

  for (const segment of segments) {
    checkSegment(segment, options, issues)
  }

  checkTimeline(segments, issues)

  const total = totalDuration(segments)
  if (targetSeconds !== null && Math.abs(total - targetSeconds) > DURATION_TOLERANCE_SEC) {
    issues.push({
      level: 'error',
      code: 'duration_off_target',
      message: `The cut runs ${total}s but ${format.label} must land within ${DURATION_TOLERANCE_SEC}s of ${targetSeconds}s`,
    })
  }

  if (segments.length === 0) {
    issues.push({ level: 'error', code: 'empty', message: 'The edit has no segments' })
  }

  return {
    ok: !issues.some((issue) => issue.level === 'error'),
    issues,
    segments,
    totalSeconds: total,
  }
}

/** Applies the corrections that have exactly one safe answer. */
function correctSegment(
  segment: PlannedSegment,
  index: number,
  options: ValidateOptions,
  issues: EdlIssue[],
): PlannedSegment {
  const asset = options.assets.get(segment.assetId)
  let next = { ...segment }

  if (!asset) return next

  if (asset.hasIndianFlag) {
    // Nothing is moved across, cropped out of, or drawn over an image of the
    // flag. There is no version of this the planner gets to override.
    if (next.motion !== 'hold') {
      issues.push({
        level: 'warning',
        code: 'flag_motion_removed',
        message: `Segment ${index + 1} holds still: its asset contains the Indian flag, so it is never panned or cropped`,
        segment: index,
        assetId: asset.id,
      })
      next = { ...next, motion: 'hold' }
    }
    if (next.captionText) {
      issues.push({
        level: 'warning',
        code: 'flag_caption_removed',
        message: `Segment ${index + 1} loses its caption: nothing is overlaid on an image of the Indian flag`,
        segment: index,
        assetId: asset.id,
      })
      next = { ...next, captionText: null }
    }
  }

  if (asset.kind === 'photo' && next.motion === 'trim') {
    issues.push({
      level: 'warning',
      code: 'photo_trim_corrected',
      message: `Segment ${index + 1} holds still: a photograph cannot be trimmed`,
      segment: index,
      assetId: asset.id,
    })
    next = { ...next, motion: 'hold', trimStartSec: null }
  }

  if (asset.kind === 'video' && ['ken_burns_in', 'ken_burns_out', 'pan_left', 'pan_right'].includes(next.motion)) {
    issues.push({
      level: 'warning',
      code: 'video_motion_corrected',
      message: `Segment ${index + 1} plays its own footage instead of a ken-burns move`,
      segment: index,
      assetId: asset.id,
    })
    next = { ...next, motion: 'trim', trimStartSec: next.trimStartSec ?? 0 }
  }

  if (asset.kind === 'video' && next.motion === 'trim' && next.trimStartSec === null) {
    next = { ...next, trimStartSec: 0 }
  }

  return next
}

function checkSegment(segment: TimedSegment, options: ValidateOptions, issues: EdlIssue[]): void {
  const index = segment.index
  const asset = options.assets.get(segment.assetId)

  if (!asset) {
    issues.push({
      level: 'error',
      code: 'unknown_asset',
      message: `Segment ${index + 1} references asset ${segment.assetId}, which is not in the library`,
      segment: index,
      assetId: segment.assetId,
    })
    return
  }

  if (!asset.consentCleared) {
    // The blocking rule: uncleared media never reaches a render.
    issues.push({
      level: options.consentFilter === false ? 'warning' : 'error',
      code: 'consent_not_cleared',
      message: `Segment ${index + 1} uses an asset that is not consent-cleared`,
      segment: index,
      assetId: asset.id,
    })
  }

  if (segment.durationSec < MIN_SEGMENT_SEC - 0.001) {
    issues.push({
      level: 'error',
      code: 'segment_too_short',
      message: `Segment ${index + 1} is ${segment.durationSec}s; nothing reads as a shot below ${MIN_SEGMENT_SEC}s`,
      segment: index,
    })
  }

  if (segment.captionText && segment.durationSec < MIN_CAPTION_SEC - 0.001) {
    issues.push({
      level: 'error',
      code: 'caption_too_short',
      message: `Segment ${index + 1} shows a caption for ${segment.durationSec}s; captions need ${MIN_CAPTION_SEC}s to be readable`,
      segment: index,
    })
  }

  if (asset.kind === 'video' && asset.durationSec) {
    const start = segment.trimStartSec ?? 0
    const end = segment.trimEndSec ?? start + segment.durationSec
    if (end > asset.durationSec + 0.05) {
      issues.push({
        level: 'error',
        code: 'trim_past_end',
        message: `Segment ${index + 1} plays to ${round(end)}s of a ${asset.durationSec}s clip`,
        segment: index,
        assetId: asset.id,
      })
    }
  }
}

/** The timeline is built here, so a gap means something upstream is broken. */
function checkTimeline(segments: TimedSegment[], issues: EdlIssue[]): void {
  for (let i = 1; i < segments.length; i++) {
    const previous = segments[i - 1]!
    const current = segments[i]!
    if (Math.abs(current.startSec - previous.endSec) > 0.002) {
      issues.push({
        level: 'error',
        code: 'timeline_discontinuous',
        message: `Segment ${i + 1} starts at ${current.startSec}s but segment ${i} ends at ${previous.endSec}s`,
        segment: i,
      })
    }
  }
}
