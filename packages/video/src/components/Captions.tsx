import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { SAFE_ZONES, type RenderTarget } from '@reelforge/shared'
import { FONTS } from '../fonts.js'
import type { Brand } from '../props.js'

interface Props {
  text: string
  target: RenderTarget
  brand: Brand
  durationInFrames: number
}

/**
 * Burned-in caption, sitting inside the platform-safe band — the lower-middle
 * third on vertical, so it clears the Reels/Shorts action bar rather than
 * disappearing behind it. Word-level timing arrives with the voiceover in build
 * step 7; until then a caption holds for its whole segment.
 */
export function Caption({ text, target, brand, durationInFrames }: Props) {
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
          {text}
        </span>
      </div>
    </AbsoluteFill>
  )
}
