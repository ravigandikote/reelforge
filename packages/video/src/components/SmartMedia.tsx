import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import type { RenderAsset, RenderSegment } from '../props.js'

interface Props {
  asset: RenderAsset
  segment: RenderSegment
  durationInFrames: number
  muteSourceAudio: boolean
  background: string
}

/** Fraction of the frame a ken-burns move travels. Subtle on purpose. */
const KEN_BURNS_SCALE = 0.07
const PAN_DISTANCE = 0.05

/**
 * One shot. Landscape stills going into a vertical frame are cropped around the
 * focal point the vision pass recorded — never a blind centre crop, which puts
 * the subject's shoulder in frame and their face outside it.
 *
 * Assets containing the Indian flag are the exception to all of it: they are
 * letterboxed whole onto a brand ground, with no crop and no movement.
 */
export function SmartMedia({ asset, segment, durationInFrames, muteSourceAudio, background }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = durationInFrames <= 1 ? 0 : frame / (durationInFrames - 1)

  const flagged = asset.hasIndianFlag
  const objectFit = flagged ? 'contain' : 'cover'
  const objectPosition = flagged
    ? 'center'
    : `${(asset.focalX * 100).toFixed(2)}% ${(asset.focalY * 100).toFixed(2)}%`

  const transform = flagged ? undefined : motionTransform(segment.motion, progress)
  const src = staticFile(asset.src)

  return (
    <AbsoluteFill style={{ backgroundColor: background, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform, transformOrigin: 'center center' }}>
        {asset.kind === 'video' ? (
          <OffthreadVideo
            src={src}
            // The EDL's in-point, expressed to Remotion in seconds.
            startFrom={Math.round((segment.trimStartSec ?? 0) * fps)}
            muted={muteSourceAudio}
            style={{ width: '100%', height: '100%', objectFit, objectPosition }}
          />
        ) : (
          <Img src={src} style={{ width: '100%', height: '100%', objectFit, objectPosition }} />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function motionTransform(motion: RenderSegment['motion'], progress: number): string | undefined {
  switch (motion) {
    case 'ken_burns_in':
      return `scale(${1 + KEN_BURNS_SCALE * progress})`
    case 'ken_burns_out':
      return `scale(${1 + KEN_BURNS_SCALE * (1 - progress)})`
    case 'pan_left':
      // Slightly oversized so the pan never exposes an edge.
      return `scale(${1 + PAN_DISTANCE * 2}) translateX(${PAN_DISTANCE * 100 * (0.5 - progress)}%)`
    case 'pan_right':
      return `scale(${1 + PAN_DISTANCE * 2}) translateX(${PAN_DISTANCE * 100 * (progress - 0.5)}%)`
    default:
      return undefined
  }
}
