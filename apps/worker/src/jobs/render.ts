import { stat } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@reelforge/db'
import { ensureDir, imageThumbnail, rendersDir, toRelative, videoThumbnail } from '@reelforge/media'
import {
  RENDER_FORMATS,
  renderJobSchema,
  validateEdl,
  type PlannerAsset,
  type RenderTarget,
} from '@reelforge/shared'
import { renderFilm } from '@reelforge/video/render'
import { markStatus, report } from '../progress.js'
import { buildRenderProps } from './renderProps.js'

/**
 * Renders one cut to an MP4, with a thumbnail, alongside the subtitles the
 * voiceover step produced. The consent gate runs again here, against the
 * database as it is now: a plan that passed validation last week must not render
 * today if someone has since withdrawn their consent.
 */
export async function runRender(raw: unknown): Promise<void> {
  const { jobId, edlId, target } = renderJobSchema.parse(raw)

  await markStatus(jobId, 'running')

  try {
    const edl = await prisma.edl.findUnique({
      where: { id: edlId },
      include: { segments: { orderBy: { index: 'asc' } }, project: true },
    })
    if (!edl) throw new Error('That cut no longer exists')

    await report(jobId, 2, 'Checking the edit against the library…')
    await assertRenderable(edl.segments, edl.project.consentFilter, target as RenderTarget)

    await report(jobId, 6, 'Preparing assets…')
    const props = await buildRenderProps(edlId)

    const outDir = await ensureDir(path.join(rendersDir(), jobId))
    const videoPath = path.join(outDir, `${target}.mp4`)
    const format = RENDER_FORMATS[target as RenderTarget]

    await report(jobId, 10, `Rendering ${format.width}×${format.height}…`)

    let lastReported = 0
    const { durationInFrames } = await renderFilm({
      props,
      outputPath: videoPath,
      onProgress: (progress) => {
        const percent = 10 + progress * 82
        if (percent - lastReported >= 5) {
          lastReported = percent
          void report(jobId, percent, `Rendering… ${Math.round(progress * 100)}%`)
        }
      },
    })

    await report(jobId, 94, 'Writing the thumbnail…')
    const thumbPath = path.join(outDir, `${target}.jpg`)
    // A frame from a third of the way in: past the title card, into the film.
    await videoThumbnail(videoPath, thumbPath, edl.actualSeconds).catch(() =>
      imageThumbnail(videoPath, thumbPath),
    )

    const { size } = await stat(videoPath)
    const render = await prisma.render.create({
      data: {
        jobId,
        edlId,
        target,
        width: format.width,
        height: format.height,
        durationSec: edl.actualSeconds,
        videoPath: toRelative(videoPath),
        srtPath: edl.srtPath,
        vttPath: edl.vttPath,
        thumbPath: toRelative(thumbPath),
        voicePath: edl.voicePath,
        bytes: size,
      },
    })

    const megabytes = (size / 1024 / 1024).toFixed(1)
    await report(
      jobId,
      100,
      `${format.label}: ${durationInFrames} frames, ${megabytes} MB`,
      { data: { renderId: render.id } },
    )
    await markStatus(jobId, 'succeeded')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await report(jobId, 100, message, { level: 'error' })
    await markStatus(jobId, 'failed', { error: message })
    throw err
  }
}

/**
 * The blocking check. Consent is re-read from the assets themselves rather than
 * trusted from the stored plan, because the plan is a snapshot and consent is
 * not.
 */
export async function assertRenderable(
  segments: Array<{
    index: number
    startSec: number
    endSec: number
    assetId: string
    motion: string
    trimStartSec: number | null
    captionText: string | null
    voiceoverText: string | null
  }>,
  consentFilter: boolean,
  target: RenderTarget,
): Promise<void> {
  const assets = await prisma.asset.findMany({
    where: { id: { in: segments.map((segment) => segment.assetId) } },
  })

  const lookup = new Map<string, PlannerAsset>(
    assets.map((asset) => [
      asset.id,
      {
        id: asset.id,
        kind: asset.kind === 'video' ? 'video' : 'photo',
        durationSec: asset.durationSec,
        consentCleared: asset.consentCleared,
        hasIndianFlag: asset.hasIndianFlag,
      },
    ]),
  )

  const validation = validateEdl(
    segments.map((segment) => ({
      assetId: segment.assetId,
      durationSec: Math.round((segment.endSec - segment.startSec) * 1000) / 1000,
      motion: segment.motion as never,
      trimStartSec: segment.trimStartSec,
      captionText: segment.captionText,
      voiceoverText: segment.voiceoverText,
    })),
    { target, assets: lookup, consentFilter },
  )

  if (!validation.ok) {
    const errors = validation.issues.filter((issue) => issue.level === 'error')
    throw new Error(
      `This cut cannot be rendered:\n${errors.map((issue) => `- ${issue.message}`).join('\n')}`,
    )
  }
}
