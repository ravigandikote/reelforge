/** One word, timed against the film's timeline (not the segment's). */
export interface TimedWord {
  word: string
  startSec: number
  endSec: number
  /** Which EDL segment the word belongs to, so cues never straddle a cut. */
  segmentIndex: number
}

/** A caption as it appears on screen: a short phrase with a start and an end. */
export interface CaptionCue {
  index: number
  startSec: number
  endSec: number
  text: string
  segmentIndex: number
  words: TimedWord[]
}
