import { prisma } from '@reelforge/db'
import { describeAsset, costUsd, type VisionInput } from '@reelforge/ai'
import { toAbsolute } from '@reelforge/media/paths'
import { visionFrames, visionImage } from '@reelforge/media'
import { analyzeJobSchema } from '@reelforge/shared'
import { markStatus, report } from '../progress.js'

/** Two at a time keeps the API busy without tripping rate limits on a big library. */
const CONCURRENCY = 2

/**
 * Vision pass: one call per asset producing a one-line description, tags, a
 * people count and a focal point for smart cropping. Human-set tags are never
 * overwritten, and an asset the model flags as containing the Indian flag is
 * marked so it can be excluded from crops and overlays.
 */
export async function runAnalyze(raw: unknown): Promise<void> {
  const { jobId, assetIds } = analyzeJobSchema.parse(raw)

  await markStatus(jobId, 'running')
  await report(jobId, 1, `Describing ${assetIds.length} asset${assetIds.length === 1 ? '' : 's'}…`)

  let done = 0
  let failed = 0
  let inputTokens = 0
  let outputTokens = 0
  let model = ''

  const queue = [...assetIds]

  async function worker() {
    for (;;) {
      const assetId = queue.shift()
      if (!assetId) return

      try {
        const result = await analyzeOne(assetId)
        inputTokens += result.inputTokens
        outputTokens += result.outputTokens
        model = result.model
        done += 1
        await report(
          jobId,
          1 + ((done + failed) / assetIds.length) * 97,
          `${result.name}: ${result.description}`,
        )
      } catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : String(err)
        await report(jobId, 1 + ((done + failed) / assetIds.length) * 97, `Skipped: ${message}`, {
          level: 'warn',
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assetIds.length) }, worker))

  const usd = model ? costUsd(model, inputTokens, outputTokens) : 0
  const summary = [
    `${done} described`,
    failed ? `${failed} failed` : null,
    `$${usd.toFixed(4)} · ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`,
  ]
    .filter(Boolean)
    .join(' · ')

  await report(jobId, 100, summary, { data: { done, failed, inputTokens, outputTokens, usd } })
  await markStatus(jobId, done > 0 ? 'succeeded' : 'failed', {
    // Stored in cents, rounded up: a run that cost anything never records zero.
    costCents: Math.ceil(usd * 100),
    error: done === 0 ? 'Every asset failed to analyse' : undefined,
  })
}

async function analyzeOne(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } })
  if (!asset) throw new Error(`Asset ${assetId} no longer exists`)

  const images: VisionInput[] =
    asset.kind === 'video'
      ? // Frames come off the 720p proxy: same pixels, far quicker to seek than
        // a 4K original.
        await visionFrames(toAbsolute(asset.proxyPath ?? asset.storagePath), asset.durationSec)
      : [await visionImage(toAbsolute(asset.storagePath))]

  if (images.length === 0) throw new Error(`${asset.originalName}: no frames could be read`)

  const { analysis, inputTokens, outputTokens, model } = await describeAsset({
    kind: asset.kind === 'video' ? 'video' : 'photo',
    originalName: asset.originalName,
    durationSec: asset.durationSec,
    capturedAt: asset.capturedAt,
    images,
  })

  const slugs = [...new Set(analysis.tags)]
  if (analysis.containsIndianFlag) slugs.push('indian_flag')

  const tags = await prisma.tag.findMany({ where: { slug: { in: slugs } } })

  await prisma.$transaction([
    prisma.asset.update({
      where: { id: assetId },
      data: {
        description: analysis.description,
        peopleCount: analysis.peopleCount,
        focalPointX: analysis.focalPoint.x,
        focalPointY: analysis.focalPoint.y,
        hasIndianFlag: analysis.containsIndianFlag,
        analysisModel: model,
        analyzedAt: new Date(),
      },
    }),
    // Only this pass's own tags are replaced — anything a person set by hand
    // survives a re-analysis.
    prisma.assetTag.deleteMany({ where: { assetId, source: 'ai' } }),
    ...tags.map((tag) =>
      prisma.assetTag.upsert({
        where: { assetId_tagId: { assetId, tagId: tag.id } },
        update: {},
        create: { assetId, tagId: tag.id, source: 'ai' },
      }),
    ),
  ])

  return {
    name: asset.originalName,
    description: analysis.description,
    inputTokens,
    outputTokens,
    model,
  }
}
