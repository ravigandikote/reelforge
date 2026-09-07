import { DEFAULT_BRAND, type RenderAsset, type RenderProps } from './props.js'
import type { RenderTarget } from '@reelforge/shared'

/**
 * A hand-written EDL over the fixture album, so the compositions can be opened
 * in the studio and rendered without a database, a project, or an API key.
 * `pnpm sample` stages these files into media/.sample first.
 */
const SAMPLE_ASSETS: RenderAsset[] = [
  {
    id: 'stage',
    kind: 'photo',
    src: '.sample/stage-wide.jpg',
    width: 1920,
    height: 1080,
    focalX: 0.42,
    focalY: 0.46,
    hasIndianFlag: false,
  },
  {
    id: 'lake',
    kind: 'photo',
    src: '.sample/lake-portrait.jpg',
    width: 1080,
    height: 1920,
    focalX: 0.5,
    focalY: 0.38,
    hasIndianFlag: false,
  },
  {
    id: 'bonfire',
    kind: 'photo',
    src: '.sample/bonfire-square.jpg',
    width: 1200,
    height: 1200,
    focalX: 0.55,
    focalY: 0.5,
    hasIndianFlag: false,
  },
  {
    id: 'performance',
    kind: 'video',
    src: '.sample/performance-landscape.mp4',
    width: 1280,
    height: 720,
    focalX: 0.5,
    focalY: 0.45,
    hasIndianFlag: false,
  },
  {
    // Stands in for an asset the vision pass flagged: letterboxed whole, held
    // still, and carrying no caption or logo.
    id: 'flagday',
    kind: 'photo',
    src: '.sample/stage-wide.jpg',
    width: 1920,
    height: 1080,
    focalX: 0.5,
    focalY: 0.5,
    hasIndianFlag: true,
  },
]

interface Beat {
  assetId: string
  seconds: number
  motion: RenderProps['segments'][number]['motion']
  caption: string | null
  trimStartSec?: number
}

const BEATS: Beat[] = [
  { assetId: 'stage', seconds: 4, motion: 'ken_burns_in', caption: 'Ten acres of farm and lake' },
  { assetId: 'lake', seconds: 3.5, motion: 'pan_right', caption: null },
  { assetId: 'performance', seconds: 4, motion: 'trim', caption: 'Dancers at dusk', trimStartSec: 0.5 },
  { assetId: 'bonfire', seconds: 3.5, motion: 'ken_burns_out', caption: 'Music around the fire' },
  { assetId: 'flagday', seconds: 3, motion: 'hold', caption: null },
  { assetId: 'stage', seconds: 4, motion: 'pan_left', caption: 'Come and spend a weekend' },
]

export function samplePropsFor(target: RenderTarget): RenderProps {
  let cursor = 0
  const segments = BEATS.map((beat, index) => {
    const startSec = Math.round(cursor * 1000) / 1000
    const endSec = Math.round((cursor + beat.seconds) * 1000) / 1000
    cursor = endSec
    return {
      index,
      startSec,
      endSec,
      assetId: beat.assetId,
      motion: beat.motion,
      trimStartSec: beat.trimStartSec ?? null,
      captionText: beat.caption,
      voiceoverText: null,
    }
  })

  return {
    target,
    segments,
    assets: SAMPLE_ASSETS,
    brand: DEFAULT_BRAND,
    titleText: 'NeeRav Arts Village',
    subtitleText: 'A weekend in the open',
    showEndCard: true,
    captionsEnabled: true,
    muteSourceAudio: true,
    voiceSrc: null,
    musicSrc: null,
  }
}
