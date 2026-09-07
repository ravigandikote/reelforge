import { describe, expect, it } from 'vitest'
import { MIN_CAPTION_SEC, buildCues, cuesFromSegments, toSrt, toVtt, type TimedWord } from '@reelforge/shared'

function words(spec: Array<[string, number, number, number?]>): TimedWord[] {
  return spec.map(([word, startSec, endSec, segmentIndex]) => ({
    word,
    startSec,
    endSec,
    segmentIndex: segmentIndex ?? 0,
  }))
}

describe('buildCues', () => {
  it('breaks at the end of a sentence', () => {
    const cues = buildCues(
      words([
        ['Ten', 0, 0.3],
        ['acres', 0.3, 0.8],
        ['of', 0.8, 0.95],
        ['farm.', 0.95, 1.6],
        ['Artists', 1.7, 2.2],
        ['come', 2.2, 2.6],
        ['here.', 2.6, 3.2],
      ]),
    )

    expect(cues).toHaveLength(2)
    expect(cues[0]!.text).toBe('Ten acres of farm.')
    expect(cues[1]!.text).toBe('Artists come here.')
  })

  it('never lets a cue straddle a cut', () => {
    const cues = buildCues(
      words([
        ['dancers', 0, 0.5, 0],
        ['on', 0.5, 0.7, 0],
        ['the', 0.7, 0.9, 1],
        ['stage', 0.9, 1.4, 1],
      ]),
      { minSeconds: 0 },
    )

    expect(cues).toHaveLength(2)
    expect(cues[0]!.segmentIndex).toBe(0)
    expect(cues[1]!.segmentIndex).toBe(1)
  })

  it('breaks on a pause in the delivery', () => {
    const cues = buildCues(
      words([
        ['music', 0, 0.5],
        ['and', 0.5, 0.8],
        // A full second of silence: a new phrase starts here.
        ['fire', 1.9, 2.4],
        ['light', 2.4, 3],
      ]),
      { minSeconds: 0 },
    )
    expect(cues).toHaveLength(2)
  })

  it('splits a long run at the word limit', () => {
    const many = words(
      Array.from({ length: 14 }, (_, i) => [`word${i}`, i * 0.3, i * 0.3 + 0.28] as [string, number, number]),
    )
    const cues = buildCues(many, { maxWords: 5 })
    expect(cues.length).toBeGreaterThanOrEqual(3)
    for (const cue of cues) expect(cue.words.length).toBeLessThanOrEqual(5)
  })

  it('holds a too-brief cue on screen rather than flashing it', () => {
    const cues = buildCues(
      words([
        ['Come', 0, 0.4],
        ['and', 0.4, 0.7],
        ['stay.', 0.7, 1.4],
        // 0.2s of speech: held to the readable minimum instead.
        ['Please.', 1.5, 1.7],
      ]),
    )

    expect(cues).toHaveLength(2)
    expect(cues[1]!.text).toBe('Please.')
    expect(cues[1]!.endSec - cues[1]!.startSec).toBeCloseTo(MIN_CAPTION_SEC, 3)
  })

  it('merges backwards when there is no room to hold it', () => {
    const cues = buildCues(
      words([
        ['Come', 0, 0.4],
        ['stay.', 0.4, 1.0],
        ['Please.', 1.05, 1.25],
        // The next phrase needs the screen almost immediately.
        ['Music', 1.3, 1.8],
        ['and', 1.8, 2.1],
        ['fire.', 2.1, 2.9],
      ]),
    )

    expect(cues[0]!.text).toBe('Come stay. Please.')
  })

  it('never holds a cue past the end of the film', () => {
    const cues = buildCues(words([['Stay.', 9.6, 9.9]]), { filmEndSec: 10 })
    expect(cues[0]!.endSec).toBeLessThanOrEqual(10)
  })

  it('gives every cue at least the readable minimum, where the words allow', () => {
    const cues = buildCues(
      words([
        ['One', 0, 0.4],
        ['two', 0.4, 0.8],
        ['three', 0.8, 1.3],
        ['four.', 1.3, 1.9],
      ]),
    )
    for (const cue of cues) {
      expect(cue.endSec - cue.startSec).toBeGreaterThanOrEqual(MIN_CAPTION_SEC - 0.001)
    }
  })

  it('returns nothing for no words', () => {
    expect(buildCues([])).toEqual([])
  })
})

describe('cuesFromSegments', () => {
  it('holds each caption for its segment when there is no voiceover', () => {
    const cues = cuesFromSegments([
      { index: 0, startSec: 0, endSec: 4, captionText: 'Ten acres of farm and lake' },
      { index: 1, startSec: 4, endSec: 7, captionText: null },
      { index: 2, startSec: 7, endSec: 11, captionText: 'Come and stay' },
    ])

    expect(cues).toHaveLength(2)
    expect(cues[0]).toMatchObject({ startSec: 0, endSec: 4 })
    expect(cues[1]).toMatchObject({ startSec: 7, endSec: 11, segmentIndex: 2 })
  })

  it('spreads word timings evenly across the segment', () => {
    const [cue] = cuesFromSegments([{ index: 0, startSec: 0, endSec: 4, captionText: 'one two three four' }])
    expect(cue!.words).toHaveLength(4)
    expect(cue!.words[0]!.endSec).toBeCloseTo(1, 3)
    expect(cue!.words[3]!.endSec).toBeCloseTo(4, 3)
  })
})

describe('subtitle export', () => {
  const cues = buildCues(
    words([
      ['Ten', 0, 0.3],
      ['acres.', 0.3, 1.4],
      ['Come', 62.5, 63],
      ['and', 63, 63.3],
      ['stay.', 63.3, 64.2],
    ]),
  )

  it('writes SRT with comma milliseconds and 1-based indices', () => {
    const srt = toSrt(cues)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,400\nTen acres.')
    expect(srt).toContain('2\n00:01:02,500 --> 00:01:04,200\nCome and stay.')
    expect(srt.endsWith('\n')).toBe(true)
  })

  it('writes VTT with a header and full-stop milliseconds', () => {
    const vtt = toVtt(cues)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.400')
  })

  it('handles an hour-long timeline', () => {
    const srt = toSrt([
      { index: 0, startSec: 3661.5, endSec: 3663.25, text: 'Late', segmentIndex: 0, words: [] },
    ])
    expect(srt).toContain('01:01:01,500 --> 01:01:03,250')
  })

  it('produces an empty file for no cues', () => {
    expect(toSrt([])).toBe('')
    expect(toVtt([])).toBe('WEBVTT\n\n')
  })
})
