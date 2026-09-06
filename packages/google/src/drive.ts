import type { Readable } from 'node:stream'
import { google } from 'googleapis'
import { clientForAccount } from './oauth.js'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  kind: 'photo' | 'video'
  bytes: number | null
  createdTime: string | null
}

/**
 * Accepts anything you can copy out of the Drive UI: a folder URL, an "open?id="
 * link, or a bare folder id.
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,})/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }

  return /^[a-zA-Z0-9_-]{10,}$/.test(trimmed) ? trimmed : null
}

async function driveClient(accountId: string) {
  return google.drive({ version: 'v3', auth: await clientForAccount(accountId) })
}

/** Lists the photos and videos directly inside a folder (not recursive). */
export async function listFolder(accountId: string, folderId: string): Promise<DriveFile[]> {
  const drive = await driveClient(accountId)
  const files: DriveFile[] = []
  let pageToken: string | undefined

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime)',
      pageSize: 200,
      pageToken,
      // Shared drives are opt-in on every call.
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: 'createdTime',
    })

    for (const file of response.data.files ?? []) {
      if (!file.id || !file.name) continue
      const mimeType = file.mimeType ?? ''
      files.push({
        id: file.id,
        name: file.name,
        mimeType,
        kind: mimeType.startsWith('video/') ? 'video' : 'photo',
        bytes: file.size ? Number(file.size) : null,
        createdTime: file.createdTime ?? null,
      })
    }
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return files
}

export async function downloadFile(accountId: string, fileId: string): Promise<Readable> {
  const drive = await driveClient(accountId)
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  )
  return response.data as unknown as Readable
}

export function describeDriveError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('404')) {
    return 'Drive could not find that folder. Check the link, and that the connected Google account can open it.'
  }
  if (message.includes('403')) {
    return 'Drive refused the request. Check that the Drive API is enabled and the drive.readonly scope was granted.'
  }
  return message
}
