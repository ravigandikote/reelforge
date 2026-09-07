import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { SAFE_ZONES, type RenderTarget } from '@reelforge/shared'
import { FONTS } from '../fonts.js'
import { LogoBug } from './Logo.js'
import type { Brand } from '../props.js'

/**
 * The title and end cards are overlaid on the opening and closing shots rather
 * than added before and after them. Adding them would push a 30-second cut to
 * 35 and break the duration contract the planner was held to.
 */
export function TitleCard({
  title,
  subtitle,
  brand,
  target,
  durationInFrames,
}: {
  title: string
  subtitle: string | null
  brand: Brand
  target: RenderTarget
  durationInFrames: number
}) {
  const frame = useCurrentFrame()
  const { height, width } = useVideoConfig()
  const zone = SAFE_ZONES[target]

  const opacity = interpolate(
    frame,
    [0, Math.round(durationInFrames * 0.15), Math.round(durationInFrames * 0.75), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' },
  )
  const rise = interpolate(frame, [0, Math.round(durationInFrames * 0.3)], [height * 0.02, 0], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${brand.indigo}CC 0%, ${brand.indigo}55 55%, transparent 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: `${zone.top * 100 + 4}%`,
          left: `${zone.left * 100}%`,
          right: `${zone.right * 100}%`,
          transform: `translateY(${rise}px)`,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: Math.min(width, height) * 0.075,
            lineHeight: 1.1,
            color: brand.cream,
            textShadow: '0 2px 16px rgba(0,0,0,0.4)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              margin: `${height * 0.012}px 0 0`,
              fontFamily: FONTS.body,
              fontSize: Math.min(width, height) * 0.032,
              color: brand.cream,
              opacity: 0.85,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  )
}

export function EndCard({
  brand,
  target,
  durationInFrames,
}: {
  brand: Brand
  target: RenderTarget
  durationInFrames: number
}) {
  const frame = useCurrentFrame()
  const { height, width } = useVideoConfig()
  const zone = SAFE_ZONES[target]

  const opacity = interpolate(frame, [0, Math.round(durationInFrames * 0.25)], [0, 1], {
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ backgroundColor: `${brand.indigo}E6` }} />
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: height * 0.02,
          paddingBottom: `${zone.bottom * 100}%`,
        }}
      >
        <LogoBug brand={brand} width={Math.min(width, height) * 0.22} color={brand.cream} />
        <p
          style={{
            margin: 0,
            fontFamily: FONTS.display,
            fontWeight: 600,
            fontSize: Math.min(width, height) * 0.05,
            color: brand.cream,
          }}
        >
          {brand.handle}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: FONTS.caption,
            fontSize: Math.min(width, height) * 0.028,
            letterSpacing: '0.08em',
            color: brand.terracotta,
          }}
        >
          {brand.website}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
