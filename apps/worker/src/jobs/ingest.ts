import { rm, rename, copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@reelforge/db'
import {
  assetDir,
  checksumFile,
  dominantColors,
  ensureDir,
  extractZip,
  imageThumbnail,
  isSupportedMedia,
  makeProxy,
  probeFile,
  stagingDir,
  toRelative,
  videoThumbnail,
} from '@reelforge/media'
import { ingestJobSchema, type IngestJobData } from '@reelforge/shared'
import { markStatus, report } from '../progress.js'

interface StagedFile {
  filePath: string
  displayName: string
}

/**
 * Upload ingest: expand any archives, then for each file probe it, move it into
 * media/<assetId>/ and build the derivatives the library grid and later the
 * renderer need. Originals are moved in untouched — nothing writes back to them.
 */
export async function runIngest(raw: unknown): Promise<void> {
  const data: IngestJobData = ingestJobSchema.parse(raw)
  const { jobId, batchId } = data

  await markStatus(jobId, 'running')
  await prisma.ingestBatch.update({ where: { id: batchId }, data: { status: 'running' } })

  try {
    const staged = await expandArchives(data.items)
    if (staged.length === 0) throw new Error('No supported media found in the upload')

    await report(jobId, 2, `Cataloguing ${staged.length} file${staged.length === 1 ? '' : 's'}…`)

    let created = 0
    let duplicates = 0
    const failures: string[] = []

    for (const [index, file] of staged.entries()) {
      // Each file owns a slice of the progress bar, from 5% to 98%.
      const slice = (n: number) => 5 + ((index + n) / staged.length) * 93

      try {
        const outcome = await ingestOne(file, batchId, data.markCleared, (n, message) =>
          report(jobId, slice(n), message),
        )
        if (outcome === 'duplicate') duplicates += 1
        else created += 1
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        failures.push(`${file.displayName}: ${reason}`)
        await report(jobId, slice(1), `Skipped ${file.displayName} — ${reason}`, { level: 'warn' })
      }
    }

    await prisma.ingestBatch.update({
      where: { id: batchId },
      data: {
        status: failures.length && !created ? 'failed' : 'succeeded',
        itemCount: created,
        error: failures.length ? failures.join('\n') : null,
      },
    })

    const summary = [
      `${created} asset${created === 1 ? '' : 's'} catalogued`,
      duplicates ? `${duplicates} already in the library` : null,
      failures.length ? `${failures.length} skipped` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    await report(jobId, 100, summary, { data: { created, duplicates, failed: failures.length } })
    await markStatus(jobId, created > 0 || duplicates > 0 ? 'succeeded' : 'failed', {
      error: created === 0 && duplicates === 0 ? failures.join('\n') : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.ingestBatch.update({
      where: { id: batchId },
      data: { status: 'failed', error: message },
    })
    await report(jobId, 100, message, { level: 'error' })
    await markStatus(jobId, 'failed', { error: message })
    throw err
  } finally {
    await cleanupStaging(batchId)
  }
}

/** Zips are unpacked next to themselves; everything else passes straight through. */
async function expandArchives(items: string[]): Promise<StagedFile[]> {
  const staged: StagedFile[] = []

  for (const item of items) {
    if (item.toLowerCase().endsWith('.zip')) {
      const destination = `${item}.extracted`
      const entries = await extractZip(item, destination)
      for (const entry of entries) {
        staged.push({ filePath: entry.filePath, displayName: entry.entryName })
      }
    } else if (isSupportedMedia(item)) {
      staged.push({ filePath: item, displayName: path.basename(item) })
    }
  }

  return staged
}

type Outcome = 'created' | 'duplicate'

async function ingestOne(
  file: StagedFile,
  batchId: string,
  markCleared: boolean,
  onProgress: (fraction: number, message: string) => Promise<void>,
): Promise<Outcome> {
  const name = path.basename(file.displayName)
  await onProgress(0.1, `Reading ${name}`)

  const checksum = await checksumFile(file.filePath)
  const existing = await prisma.asset.findFirst({ where: { checksum } })
  if (existing) {
    await onProgress(1, `${name} is already in the library`)
    return 'duplicate'
  }

  const probe = await probeFile(file.filePath)
  const { size } = await stat(file.filePath)
  const extension = path.extname(file.filePath).toLowerCase() || '.bin'

  // The row is created first so the asset id can name its own folder; the
  // storagePath is corrected as soon as the original is in place.
  const asset = await prisma.asset.create({
    data: {
      batchId,
      kind: probe.kind,
      originalName: name,
      storagePath: `pending:${checksum}`,
      mimeType: probe.mimeType,
      bytes: size,
      checksum,
      width: probe.width,
      height: probe.height,
      orientation: probe.orientation,
      durationSec: probe.durationSec,
      fps: probe.fps,
      hasAudio: probe.hasAudio,
      capturedAt: probe.capturedAt,
      exifJson: JSON.stringify(probe.metadata),
      consentCleared: markCleared,
    },
  })

  try {
    const dir = await ensureDir(assetDir(asset.id))
    const originalPath = path.join(dir, `original${extension}`)
    await moveFile(file.filePath, originalPath)

    await onProgress(0.4, `Building preview for ${name}`)
    const thumbPath = path.join(dir, 'thumb.jpg')
    let proxyPath: string | null = null

    if (probe.kind === 'photo') {
      await imageThumbnail(originalPath, thumbPath)
    } else {
      await videoThumbnail(originalPath, thumbPath, probe.durationSec)
      proxyPath = path.join(dir, 'proxy.mp4')
      await onProgress(0.6, `Transcoding proxy for ${name}`)
      await makeProxy(originalPath, proxyPath)
    }

    // Colours come off the thumbnail: same frame, a fraction of the pixels.
    const colors = await dominantColors(thumbPath).catch(() => [])

    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        storagePath: toRelative(originalPath),
        thumbPath: toRelative(thumbPath),
        proxyPath: proxyPath ? toRelative(proxyPath) : null,
        dominantColorsJson: colors.length ? JSON.stringify(colors) : null,
      },
    })

    await onProgress(1, `Catalogued ${name}`)
    return 'created'
  } catch (err) {
    // A half-ingested asset would show up in the grid as a broken tile.
    await prisma.asset.delete({ where: { id: asset.id } }).catch(() => {})
    await rm(assetDir(asset.id), { recursive: true, force: true }).catch(() => {})
    throw err
  }
}

/** rename() fails across devices (staging on tmpfs, media on disk); fall back to copy. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}

/** Staging is one directory per batch under tmp/uploads, so this cannot touch media/. */
async function cleanupStaging(batchId: string): Promise<void> {
  await rm(path.join(stagingDir(), batchId), { recursive: true, force: true }).catch(() => {})
}
