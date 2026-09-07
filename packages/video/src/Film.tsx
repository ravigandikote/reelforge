import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from 'remotion'
import { RENDER_FORMATS, SAFE_ZONES } from '@reelforge/shared'
import { BrandFonts } from './components/BrandFonts.js'
import { Caption } from './components/Captions.js'
import { EndCard, TitleCard } from './components/Cards.js'
import { LogoBug } from './components/Logo.js'
import { SmartMedia } from './components/SmartMedia.js'
import type { RenderProps } from './props.js'

/** Title holds for this long over the opening shot; the end card for this long over the last. */
const TITLE_SECONDS = 2.2
const END_CARD_SECONDS = 2.6

export function Film(props: RenderProps) {
  const { fps, width, height } = useVideoConfig()
  const { segments, assets, brand, target } = props
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const zone = SAFE_ZONES[target]
  const format = RENDER_FORMATS[target]

  const totalFrames = Math.max(1, Math.round((segments.at(-1)?.endSec ?? 0) * fps))
  const titleFrames = Math.round(TITLE_SECONDS * fps)
  const endFrames = Math.round(END_CARD_SECONDS * fps)
  // Once the end card is up it owns the frame: captions and the logo bug stop
  // rather than showing through the scrim.
  const showEndCard = props.showEndCard && totalFrames > endFrames
  const endCardFrom = showEndCard ? totalFrames - endFrames : totalFrames

  // A flagged asset carries no overlays at all, so the logo bug and captions
  // are suppressed wherever one is on screen.
  const flaggedRanges = segments
    .filter((segment) => assetById.get(segment.assetId)?.hasIndianFlag)
    .map((segment) => [
      Math.round(segment.startSec * fps),
      Math.round(segment.endSec * fps),
    ])

  return (
    <AbsoluteFill style={{ backgroundColor: brand.indigo }}>
      <BrandFonts />
      {segments.map((segment) => {
        const asset = assetById.get(segment.assetId)
        if (!asset) return null

        const from = Math.round(segment.startSec * fps)
        const durationInFrames = Math.max(1, Math.round(segment.endSec * fps) - from)
        const flagged = asset.hasIndianFlag

        return (
          <Sequence key={segment.index} from={from} durationInFrames={durationInFrames}>
            <SmartMedia
              asset={asset}
              segment={segment}
              durationInFrames={durationInFrames}
              muteSourceAudio={props.muteSourceAudio}
              background={brand.indigo}
            />
            {props.captionsEnabled && props.cues.length === 0 && segment.captionText && !flagged && (() => {
              const captionFrames = Math.min(durationInFrames, Math.max(0, endCardFrom - from))
              if (captionFrames <= 0) return null
              return (
                <Sequence durationInFrames={captionFrames}>
                  <Caption
                    text={segment.captionText}
                    target={target}
                    brand={brand}
                    durationInFrames={captionFrames}
                  />
                </Sequence>
              )
            })()}
          </Sequence>
        )
      })}

      {/* Speech-timed cues sit above the shots, independent of the cuts: a
          sentence that runs across a cut stays on screen through it. */}
      {props.captionsEnabled &&
        props.cues.map((cue) => {
          const from = Math.round(cue.startSec * fps)
          const frames = Math.max(1, Math.round(cue.endSec * fps) - from)
          const visible = Math.min(frames, Math.max(0, endCardFrom - from))
          if (visible <= 0) return null

          const asset = assetById.get(segments.find((s) => s.index === cue.segmentIndex)?.assetId ?? '')
          // Nothing is overlaid on an asset containing the flag, captions included.
          if (asset?.hasIndianFlag) return null

          return (
            <Sequence key={`cue-${cue.index}`} from={from} durationInFrames={visible}>
              <Caption
                text={cue.text}
                target={target}
                brand={brand}
                durationInFrames={visible}
                words={cue.words}
                cueStartSec={cue.startSec}
              />
            </Sequence>
          )
        })}

      {/* The logo sits above the shots but below the cards, and steps aside
          for any segment showing the flag. */}
      {flaggedRanges.length < segments.length && (
        <LogoLayer
          props={props}
          zone={zone}
          width={width}
          height={height}
          totalFrames={endCardFrom}
          flaggedRanges={flaggedRanges}
        />
      )}

      {format.hasTitleCard && props.titleText && (
        <Sequence durationInFrames={titleFrames}>
          <TitleCard
            title={props.titleText}
            subtitle={props.subtitleText}
            brand={brand}
            target={target}
            durationInFrames={titleFrames}
          />
        </Sequence>
      )}

      {showEndCard && (
        <Sequence from={endCardFrom} durationInFrames={endFrames}>
          <EndCard brand={brand} target={target} durationInFrames={endFrames} />
        </Sequence>
      )}

      {props.voiceSrc && <Audio src={staticFile(props.voiceSrc)} />}
      {props.musicSrc && <Audio src={staticFile(props.musicSrc)} volume={0.18} />}
    </AbsoluteFill>
  )
}

function LogoLayer({
  props,
  zone,
  width,
  height,
  totalFrames,
  flaggedRanges,
}: {
  props: RenderProps
  zone: (typeof SAFE_ZONES)[keyof typeof SAFE_ZONES]
  width: number
  height: number
  totalFrames: number
  flaggedRanges: number[][]
}) {
  // Rendered as one sequence per gap between flagged segments.
  const gaps: Array<[number, number]> = []
  let cursor = 0
  for (const [start, end] of flaggedRanges.sort((a, b) => a[0]! - b[0]!)) {
    if (start! > cursor) gaps.push([cursor, start!])
    cursor = Math.max(cursor, end!)
  }
  if (cursor < totalFrames) gaps.push([cursor, totalFrames])

  const size = Math.min(width, height) * 0.075

  return (
    <>
      {gaps.map(([from, to]) => (
        <Sequence key={`logo-${from}`} from={from} durationInFrames={Math.max(1, to - from)}>
          <div
            style={{
              position: 'absolute',
              right: `${zone.right * 100}%`,
              top: `${zone.top * 100}%`,
              opacity: 0.85,
            }}
          >
            <LogoBug brand={props.brand} width={size} color={props.brand.cream} />
          </div>
        </Sequence>
      ))}
    </>
  )
}
