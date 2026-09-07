import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { SAFE_ZONES, type RenderTarget } from '@reelforge/shared'
import { FONTS } from '../fonts.js'
import type { Brand } from '../props.js'

interface Props {
  text: string
  target: RenderTarget
  brand: Brand
  durationInFrames: number
  /** Word timings relative to this cue's start, for word-by-word highlighting. */
  words?: Array<{ word: string; startSec: number; endSec: number }>
  /** Where the cue starts on the film timeline, so word times can be compared. */
  cueStartSec?: number
}

/**
 * Burned-in caption, sitting inside the platform-safe band — the lower-middle
 * third on vertical, so it clears the Reels/Shorts action bar rather than
 * disappearing behind it. Word-level timing arrives with the voiceover in build
 * step 7; until then a caption holds for its whole segment.
 */
export function Caption({
  text,
  target,
  brand,
  durationInFrames,
  words,
  cueStartSec = 0,
}: Props) {
  const frame = useCurrentFrame()
  const { fps, height } = useVideoConfig()
  const zone = SAFE_ZONES[target]

  const fade = Math.min(Math.round(fps * 0.25), Math.floor(durationInFrames / 3))
  const opacity = interpolate(
    frame,
    [0, fade, Math.max(durationInFrames - fade, fade + 1), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )

  const bandTop = zone.captionBand.top * height
  const bandHeight = (zone.captionBand.bottom - zone.captionBand.top) * height

  // Time within the cue, used to decide which word is being spoken right now.
  const elapsed = cueStartSec + frame / fps

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          top: bandTop,
          height: bandHeight,
          left: `${zone.left * 100}%`,
          right: `${zone.right * 100}%`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: FONTS.caption,
            fontWeight: 600,
            fontSize: height * 0.032,
            lineHeight: 1.35,
            textAlign: 'center',
            color: brand.cream,
            backgroundColor: `${brand.indigo}D9`,
            padding: `${height * 0.012}px ${height * 0.022}px`,
            borderRadius: height * 0.012,
            // Keeps the text legible even where the pill meets a bright frame.
            textShadow: '0 2px 8px rgba(0,0,0,0.35)',
            boxDecorationBreak: 'clone',
          }}
        >
          {words && words.length > 0
            ? words.map((word, index) => {
                const spoken = elapsed >= word.startSec
                const current = spoken && elapsed < word.endSec
                return (
                  <span
                    key={`${word.word}-${index}`}
                    style={{
                      // Words brighten as they are said; the current one takes
                      // the accent colour, which is what makes a caption read
                      // as following the voice rather than sitting under it.
                      color: current ? brand.terracotta : brand.cream,
                      opacity: spoken ? 1 : 0.55,
                      transition: 'none',
                    }}
                  >
                    {word.word}
                    {index < words.length - 1 ? ' ' : ''}
                  </span>
                )
              })
            : text}
        </span>
      </div>
    </AbsoluteFill>
  )
}
