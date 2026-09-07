import type { TimedWord } from '@reelforge/shared'

/** ElevenLabs returns per-character timings; captions need words. */
export interface CharacterAlignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

/**
 * Folds character timings into words. A word starts at the first character
 * after whitespace and ends at its last character, so punctuation stays
 * attached — which is what the cue builder looks for when deciding where a
 * sentence ends.
 */
export function wordsFromAlignment(
  alignment: CharacterAlignment,
  options: { offsetSec?: number; segmentIndex?: number } = {},
): TimedWord[] {
  const offset = options.offsetSec ?? 0
  const segmentIndex = options.segmentIndex ?? 0
  const words: TimedWord[] = []

  let text = ''
  let startSec = 0
  let endSec = 0

  const flush = () => {
    const trimmed = text.trim()
    if (trimmed.length > 0) {
      words.push({
        word: trimmed,
        startSec: Math.round((startSec + offset) * 1000) / 1000,
        endSec: Math.round((endSec + offset) * 1000) / 1000,
        segmentIndex,
      })
    }
    text = ''
  }

  for (const [index, character] of alignment.characters.entries()) {
    const characterStart = alignment.character_start_times_seconds[index] ?? endSec
    const characterEnd = alignment.character_end_times_seconds[index] ?? characterStart

    if (/\s/.test(character)) {
      flush()
      continue
    }

    if (text.length === 0) startSec = characterStart
    text += character
    endSec = characterEnd
  }

  flush()
  return words
}
