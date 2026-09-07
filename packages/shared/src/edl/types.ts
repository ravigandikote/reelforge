import type { Motion } from '../schemas/edl.js'

/** What the validator needs to know about an asset the EDL references. */
export interface PlannerAsset {
  id: string
  kind: 'photo' | 'video'
  durationSec: number | null
  consentCleared: boolean
  hasIndianFlag: boolean
}

/** A segment as the planner produces it: a length, not a position on a timeline. */
export interface PlannedSegment {
  assetId: string
  durationSec: number
  motion: Motion
  trimStartSec: number | null
  captionText: string | null
  voiceoverText: string | null
}

/** A segment placed on the timeline, which is what gets stored and rendered. */
export interface TimedSegment extends PlannedSegment {
  index: number
  startSec: number
  endSec: number
  trimEndSec: number | null
}

export type IssueLevel = 'error' | 'warning'

export interface EdlIssue {
  level: IssueLevel
  code: string
  message: string
  /** Segment index, when the issue is about one segment. */
  segment?: number
  assetId?: string
}

export interface ValidationResult {
  /** False when any error is present: a render must not start. */
  ok: boolean
  issues: EdlIssue[]
  segments: TimedSegment[]
  totalSeconds: number
}
