import { MIN_CAPTION_SEC } from '../constants/formats.js'
import type { CaptionCue, TimedWord } from './types.js'

export interface CueOptions {
  /** Most words on screen at once. Six or seven is the readable limit at reel sizes. */
  maxWords?: number
  /** Longest a single cue stays up before it should have been split. */
  maxSeconds?: number
  /** A pause longer than this ends the phrase, even mid-sentence. */
  gapSeconds?: number
  /** Never show a cue for less than this. */
  minSeconds?: number
  /** End of the film. A held cue is never extended past it. */
  filmEndSec?: number
}

const DEFAULTS = {
  maxWords: 6,
  maxSeconds: 3.2,
  gapSeconds: 0.45,
  minSeconds: MIN_CAPTION_SEC,
  filmEndSec: Number.POSITIVE_INFINITY,
}

/**
 * Groups word timings into readable phrases.
 *
 * Cues break on sentence punctuation, on a pause in the delivery, at the word
 * limit, and always at a segment boundary — a caption that straddles a cut
 * reads as a mistake. Short trailing cues are merged backwards so a stray
 * "…village." never flashes up for a third of a second.
 */
export function buildCues(words: TimedWord[], options: CueOptions = {}): CaptionCue[] {
  const config = { ...DEFAULTS, ...options }
  if (words.length === 0) return []

  const groups: TimedWord[][] = []
  let current: TimedWord[] = []

  for (const [index, word] of words.entries()) {
    const previous = words[index - 1]
    const crossesSegment = previous !== undefined && previous.segmentIndex !== word.segmentIndex
    const afterPause = previous !== undefined && word.startSec - previous.endSec > config.gapSeconds
    const wouldBeTooLong =
      current.length > 0 && word.endSec - current[0]!.startSec > config.maxSeconds
    const full = current.length >= config.maxWords

    if (current.length > 0 && (crossesSegment || afterPause || wouldBeTooLong || full)) {
      groups.push(current)
      current = []
    }

    current.push(word)

    // A finished sentence is the most natural place to break.
    if (/[.!?…]$/.test(word.word) && current.length > 0) {
      groups.push(current)
      current = []
    }
  }

  if (current.length > 0) groups.push(current)

  const cues: CaptionCue[] = groups.map((group, index) => ({
    index,
    startSec: group[0]!.startSec,
    endSec: group.at(-1)!.endSec,
    text: group.map((word) => word.word).join(' '),
    segmentIndex: group[0]!.segmentIndex,
    words: group,
  }))

  return fixShortCues(cues, config)
}

/**
 * A cue whose words take less than the readable minimum to say is first held
 * longer — a caption may stay up after the speech has moved on — and only
 * merged backwards if there is no room to hold it. Merging is the second choice
 * because it can push a cue past the word limit, which is its own readability
 * problem.
 */
function fixShortCues(
  cues: CaptionCue[],
  config: Required<CueOptions>,
): CaptionCue[] {
  const result: CaptionCue[] = []

  for (const cue of cues) {
    const previous = result.at(-1)
    const duration = cue.endSec - cue.startSec

    if (duration >= config.minSeconds) {
      result.push(cue)
      continue
    }

    // How far this cue could run before the next one needs the screen.
    const wanted = cue.startSec + config.minSeconds
    const nextStart = cues[cue.index + 1]?.startSec ?? config.filmEndSec
    if (wanted <= nextStart) {
      result.push({ ...cue, endSec: wanted })
      continue
    }

    const canMerge =
      previous !== undefined &&
      previous.segmentIndex === cue.segmentIndex &&
      previous.words.length + cue.words.length <= config.maxWords &&
      cue.endSec - previous.startSec <= config.maxSeconds

    if (canMerge && previous) {
      previous.endSec = cue.endSec
      previous.text = `${previous.text} ${cue.text}`
      previous.words = [...previous.words, ...cue.words]
      continue
    }

    // No room to hold it and no safe merge: show it for as long as there is.
    result.push({ ...cue, endSec: Math.max(cue.endSec, Math.min(wanted, nextStart)) })
  }

  return result.map((cue, index) => ({ ...cue, index }))
}

/**
 * Cues for a film with no voiceover: the EDL's caption text, held for its
 * segment. Word timings are spread evenly, which is honest — there is no speech
 * to align to, and an even spread reads better than a guess at emphasis.
 */
export function cuesFromSegments(
  segments: Array<{ index: number; startSec: number; endSec: number; captionText: string | null }>,
): CaptionCue[] {
  const cues: CaptionCue[] = []

  for (const segment of segments) {
    const text = segment.captionText?.trim()
    if (!text) continue

    const parts = text.split(/\s+/)
    const duration = segment.endSec - segment.startSec
    const perWord = duration / parts.length

    cues.push({
      index: cues.length,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text,
      segmentIndex: segment.index,
      words: parts.map((word, position) => ({
        word,
        startSec: segment.startSec + position * perWord,
        endSec: segment.startSec + (position + 1) * perWord,
        segmentIndex: segment.index,
      })),
    })
  }

  return cues
}
