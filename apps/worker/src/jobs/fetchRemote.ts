import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { accessTokenFor, downloadFile, downloadUrl, extensionForMime } from '@reelforge/google'
import { ensureDir, stagingDir } from '@reelforge/media/paths'
import type { IngestJobData, RemoteItem } from '@reelforge/shared'

export interface StagedFile {
  filePath: string
  displayName: string
}

/**
 * Downloads everything a remote source selected into the same staging layout the
 * upload route writes, so cataloguing afterwards is identical for every source.
 */
export async function fetchRemoteItems(
  data: IngestJobData,
  onProgress: (fraction: number, message: string) => Promise<void>,
): Promise<{ staged: StagedFile[]; failures: string[] }> {
  const staged: StagedFile[] = []
  const failures: string[] = []
  const items = data.remoteItems
  // Picker downloads need a bearer token; a share link is public.
  const token =
    data.source === 'share_link' || !data.accountId ? null : await accessTokenFor(data.accountId)

  for (const [index, item] of items.entries()) {
    const fraction = (index + 1) / items.length
    try {
      await onProgress(fraction, `Downloading ${item.name} (${index + 1}/${items.length})`)
      const dir = await ensureDir(path.join(stagingDir(), data.batchId, String(index)))
      const filePath = path.join(dir, safeName(item))

      if (data.source === 'google_drive') {
        if (!data.accountId) throw new Error('No Google account is connected')
        await pipeline(await downloadFile(data.accountId, item.id), createWriteStream(filePath))
      } else {
        await downloadHttp(urlFor(data, item), filePath, token)
      }

      staged.push({ filePath, displayName: item.name })
    } catch (err) {
      failures.push(`${item.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { staged, failures }
}

function urlFor(data: IngestJobData, item: RemoteItem): string {
  if (!item.url) throw new Error('No download URL for this item')
  // The Picker's baseUrl needs =d / =dv to return the original bytes; without
  // the suffix Google hands back a stripped, resized preview.
  return data.source === 'google_photos_picker'
    ? downloadUrl({ url: item.url, kind: item.kind })
    : item.url
}

/** Filenames come from Google, so they are sanitised and given an extension. */
function safeName(item: RemoteItem): string {
  const base = path.basename(item.name).replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'item'
  return path.extname(base) ? base : `${base}${extensionForMime(item.mimeType, item.kind)}`
}

async function downloadHttp(url: string, filePath: string, token: string | null): Promise<void> {
  const response = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    redirect: 'follow',
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Google refused the download (HTTP ${response.status}) — try reconnecting`)
    }
    throw new Error(`Download failed with HTTP ${response.status}`)
  }
  if (!response.body) throw new Error('Google returned an empty response')

  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(filePath))
}
