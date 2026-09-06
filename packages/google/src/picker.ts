import { accessTokenFor } from './oauth.js'

const PICKER_API = 'https://photospicker.googleapis.com/v1'

export interface PickerSession {
  id: string
  /** Open this in a browser tab: it is where the user picks albums or items. */
  pickerUri: string
  mediaItemsSet: boolean
  pollIntervalMs: number
  expireTime: string | null
}

export interface PickedItem {
  id: string
  name: string
  mimeType: string
  kind: 'photo' | 'video'
  /** Picker baseUrl; download needs the `=d` / `=dv` suffix and a bearer token. */
  url: string
  createTime: string | null
  width: number | null
  height: number | null
}

async function pickerFetch<T>(
  accountId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessTokenFor(accountId)
  const response = await fetch(`${PICKER_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(describePickerError(response.status, body))
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

function describePickerError(status: number, body: string): string {
  if (status === 401) return 'Google rejected the token — reconnect the account in Settings.'
  if (status === 403) {
    return 'Google refused the request. Check that the Photos Picker API is enabled for the project and that the photospicker.mediaitems.readonly scope was granted.'
  }
  if (status === 404) return 'That picker session no longer exists — start a new one.'
  const detail = body.slice(0, 300)
  return `Google Photos Picker API error ${status}${detail ? `: ${detail}` : ''}`
}

function parseSession(raw: Record<string, unknown>): PickerSession {
  const polling = raw.pollingConfig as { pollInterval?: string } | undefined
  // pollInterval arrives as a duration string like "3.5s".
  const seconds = polling?.pollInterval ? Number.parseFloat(polling.pollInterval) : 3
  return {
    id: String(raw.id),
    pickerUri: String(raw.pickerUri ?? ''),
    mediaItemsSet: Boolean(raw.mediaItemsSet),
    pollIntervalMs: Math.max(1000, Math.round((Number.isFinite(seconds) ? seconds : 3) * 1000)),
    expireTime: raw.expireTime ? String(raw.expireTime) : null,
  }
}

export async function createSession(accountId: string): Promise<PickerSession> {
  const raw = await pickerFetch<Record<string, unknown>>(accountId, '/sessions', {
    method: 'POST',
    body: '{}',
  })
  return parseSession(raw)
}

export async function getSession(accountId: string, sessionId: string): Promise<PickerSession> {
  const raw = await pickerFetch<Record<string, unknown>>(
    accountId,
    `/sessions/${encodeURIComponent(sessionId)}`,
  )
  return parseSession(raw)
}

/** Sessions expire on their own, but deleting one immediately is tidier. */
export async function deleteSession(accountId: string, sessionId: string): Promise<void> {
  await pickerFetch(accountId, `/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

interface RawMediaItem {
  id?: string
  createTime?: string
  type?: string
  mediaFile?: {
    baseUrl?: string
    mimeType?: string
    filename?: string
    mediaFileMetadata?: { width?: number | string; height?: number | string }
  }
}

export function toPickedItem(raw: RawMediaItem): PickedItem | null {
  const file = raw.mediaFile
  if (!raw.id || !file?.baseUrl) return null

  const mimeType = file.mimeType ?? ''
  const kind: 'photo' | 'video' =
    raw.type === 'VIDEO' || mimeType.startsWith('video/') ? 'video' : 'photo'
  const metadata = file.mediaFileMetadata ?? {}

  return {
    id: raw.id,
    name: file.filename ?? `${raw.id}${extensionForMime(mimeType, kind)}`,
    mimeType: mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    kind,
    url: file.baseUrl,
    createTime: raw.createTime ?? null,
    width: metadata.width !== undefined ? Number(metadata.width) : null,
    height: metadata.height !== undefined ? Number(metadata.height) : null,
  }
}

export function extensionForMime(mimeType: string, kind: 'photo' | 'video'): string {
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/heic': '.heic',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
  }
  return known[mimeType] ?? (kind === 'video' ? '.mp4' : '.jpg')
}

/** Every item the user selected in the picker, following pagination. */
export async function listPickedItems(
  accountId: string,
  sessionId: string,
): Promise<PickedItem[]> {
  const items: PickedItem[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({ sessionId, pageSize: '100' })
    if (pageToken) params.set('pageToken', pageToken)

    const page = await pickerFetch<{ mediaItems?: RawMediaItem[]; nextPageToken?: string }>(
      accountId,
      `/mediaItems?${params.toString()}`,
    )

    for (const raw of page.mediaItems ?? []) {
      const item = toPickedItem(raw)
      if (item) items.push(item)
    }
    pageToken = page.nextPageToken
  } while (pageToken)

  return items
}

/**
 * Download URL for a picked item. `=d` gives the original photo bytes including
 * EXIF; `=dv` gives the original video. Without the suffix Google returns a
 * stripped, resized preview.
 */
export function downloadUrl(item: Pick<PickedItem, 'url' | 'kind'>): string {
  return `${item.url}=${item.kind === 'video' ? 'dv' : 'd'}`
}
