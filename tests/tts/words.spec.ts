import { describe, expect, it } from 'vitest'
import { wordsFromAlignment, type CharacterAlignment } from '@reelforge/tts'

function alignment(text: string, perChar = 0.1): CharacterAlignment {
  const characters = [...text]
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => Number((i * perChar).toFixed(4))),
    character_end_times_seconds: characters.map((_, i) => Number(((i + 1) * perChar).toFixed(4))),
  }
}

describe('wordsFromAlignment', () => {
  it('folds characters into words with their own start and end', () => {
    const words = wordsFromAlignment(alignment('Ten acres'))

    expect(words.map((w) => w.word)).toEqual(['Ten', 'acres'])
    expect(words[0]).toMatchObject({ startSec: 0, endSec: 0.3 })
    // "acres" starts at character 4, after the space.
    expect(words[1]!.startSec).toBeCloseTo(0.4, 3)
    expect(words[1]!.endSec).toBeCloseTo(0.9, 3)
  })

  it('keeps punctuation attached, which is where cues break', () => {
    const words = wordsFromAlignment(alignment('Come and stay. Please!'))
    expect(words.map((w) => w.word)).toEqual(['Come', 'and', 'stay.', 'Please!'])
  })

  it('offsets every word onto the film timeline', () => {
    const words = wordsFromAlignment(alignment('Ten acres'), { offsetSec: 12.5, segmentIndex: 3 })
    expect(words[0]!.startSec).toBeCloseTo(12.5, 3)
    expect(words[0]!.segmentIndex).toBe(3)
    expect(words[1]!.startSec).toBeCloseTo(12.9, 3)
  })

  it('collapses runs of whitespace rather than emitting empty words', () => {
    const words = wordsFromAlignment(alignment('a  \n b'))
    expect(words.map((w) => w.word)).toEqual(['a', 'b'])
  })

  it('handles an empty alignment', () => {
    expect(
      wordsFromAlignment({
        characters: [],
        character_start_times_seconds: [],
        character_end_times_seconds: [],
      }),
    ).toEqual([])
  })

  it('survives an alignment with missing timings', () => {
    const words = wordsFromAlignment({
      characters: ['h', 'i'],
      character_start_times_seconds: [0],
      character_end_times_seconds: [0.2],
    })
    expect(words).toHaveLength(1)
    expect(words[0]!.word).toBe('hi')
  })
})
