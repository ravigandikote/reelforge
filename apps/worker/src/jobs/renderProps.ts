import { copyFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fromJson, prisma } from '@reelforge/db'
import { ensureDir, mediaDir, toAbsolute } from '@reelforge/media/paths'
import { DEFAULT_BRAND, type RenderProps } from '@reelforge/video/props'
import {
  BRAND_COLORS,
  cuesFromSegments,
  type RenderTarget,
  type TimedWord,
  buildCues,
} from '@reelforge/shared'

/**
 * Remotion resolves staticFile() against one public directory, and the audio and
 * logos live outside it. Rather than widen the public dir to the whole repo —
 * which the bundler would then copy — the few files a render needs are staged
 * into media/.render/<edlId>/.
 */
async function stage(edlId: string, source: string | null, name: string): Promise<string | null> {
  if (!source) return null
  const absolute = toAbsolute(source)
  if (!existsSync(absolute)) return null

  const dir = await ensureDir(path.join(mediaDir(), '.render', edlId))
  const destination = path.join(dir, name)
  await copyFile(absolute, destination)
  return `.render/${edlId}/${name}`
}

/** media/<id>/original.jpg on disk is <id>/original.jpg to staticFile(). */
function publicPath(storagePath: string): string {
  const relative = path.relative(mediaDir(), toAbsolute(storagePath))
  return relative.split(path.sep).join('/')
}

export async function buildRenderProps(edlId: string): Promise<RenderProps> {
  const edl = await prisma.edl.findUnique({
    where: { id: edlId },
    include: {
      segments: { orderBy: { index: 'asc' }, include: { words: { orderBy: { startSec: 'asc' } } } },
      project: { include: { brandKit: true } },
    },
  })
  if (!edl) throw new Error('That cut no longer exists')

  const assetIds = [...new Set(edl.segments.map((segment) => segment.assetId))]
  const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } } })

  const kit = edl.project.brandKit
  const colors = fromJson(kit?.colorsJson, BRAND_COLORS)
  const brand = {
    ...DEFAULT_BRAND,
    cream: colors.cream,
    indigo: colors.indigo,
    terracotta: colors.terracotta,
    handle: kit?.handle ?? DEFAULT_BRAND.handle,
    website: kit?.website ?? DEFAULT_BRAND.website,
    logoSrc: await stage(edlId, kit?.logoPath ?? null, 'logo.png'),
    logoMarkSrc: await stage(edlId, kit?.logoMarkPath ?? null, 'logo-mark.png'),
  }

  // The voiceover step already mixed music under the narration, so the render
  // takes one finished track rather than mixing again.
  const audioSrc =
    (await stage(edlId, edl.musicPath, 'audio.m4a')) ?? (await stage(edlId, edl.voicePath, 'voice.m4a'))

  const words: TimedWord[] = edl.segments.flatMap((segment) =>
    segment.words.map((word) => ({
      word: word.word,
      startSec: word.startSec,
      endSec: word.endSec,
      segmentIndex: segment.index,
    })),
  )

  const cues =
    words.length > 0
      ? buildCues(words, { filmEndSec: edl.actualSeconds })
      : cuesFromSegments(edl.segments)

  return {
    target: edl.target as RenderTarget,
    segments: edl.segments.map((segment) => ({
      index: segment.index,
      startSec: segment.startSec,
      endSec: segment.endSec,
      assetId: segment.assetId,
      motion: segment.motion as RenderProps['segments'][number]['motion'],
      trimStartSec: segment.trimStartSec,
      captionText: segment.captionText,
      voiceoverText: segment.voiceoverText,
    })),
    assets: assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind === 'video' ? 'video' : 'photo',
      // Originals are used for the render; the 720p proxy is a preview format.
      src: publicPath(asset.storagePath),
      width: asset.width,
      height: asset.height,
      focalX: asset.focalPointX ?? 0.5,
      focalY: asset.focalPointY ?? 0.5,
      hasIndianFlag: asset.hasIndianFlag,
    })),
    brand,
    titleText: fromJson<{ titleText: string | null }>(edl.rawJson, { titleText: null }).titleText
      ?? edl.project.title,
    subtitleText: null,
    showEndCard: true,
    captionsEnabled: true,
    muteSourceAudio: true,
    cues: cues.map((cue) => ({
      index: cue.index,
      startSec: cue.startSec,
      endSec: cue.endSec,
      text: cue.text,
      segmentIndex: cue.segmentIndex,
      words: cue.words.map((word) => ({
        word: word.word,
        startSec: word.startSec,
        endSec: word.endSec,
      })),
    })),
    voiceSrc: audioSrc,
    musicSrc: null,
  }
}
