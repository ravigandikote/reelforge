import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Picker API has no googleapis client, so picker.ts talks REST. Stubbing the
// token lookup lets the request/response handling be tested without Google.
vi.mock('../../packages/google/src/oauth.js', () => ({
  accessTokenFor: async () => 'test-access-token',
}))

const { createSession, getSession, listPickedItems } = await import(
  '../../packages/google/src/picker.js'
)

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('createSession', () => {
  it('posts to the sessions endpoint with a bearer token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'sessions/abc',
        pickerUri: 'https://photos.google.com/picker/abc',
        mediaItemsSet: false,
        pollingConfig: { pollInterval: '3.5s' },
      }),
    )

    const session = await createSession('account-1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://photospicker.googleapis.com/v1/sessions')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer test-access-token')
    // "3.5s" is a duration string, not a number of milliseconds.
    expect(session.pollIntervalMs).toBe(3500)
    expect(session.mediaItemsSet).toBe(false)
  })

  it('defaults the poll interval when Google omits it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 's', pickerUri: 'u', mediaItemsSet: true }))
    expect((await createSession('account-1')).pollIntervalMs).toBe(3000)
  })
})

describe('getSession errors', () => {
  it('explains a 403 in terms of the console setup', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403))
    await expect(getSession('account-1', 'abc')).rejects.toThrow(/Photos Picker API is enabled/)
  })

  it('tells the user to reconnect on a 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401))
    await expect(getSession('account-1', 'abc')).rejects.toThrow(/reconnect/i)
  })
})

describe('listPickedItems', () => {
  it('follows pagination and maps every item', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          mediaItems: [
            {
              id: 'a',
              type: 'PHOTO',
              mediaFile: { baseUrl: 'https://lh3.example/a', mimeType: 'image/jpeg', filename: 'a.jpg' },
            },
          ],
          nextPageToken: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          mediaItems: [
            {
              id: 'b',
              type: 'VIDEO',
              mediaFile: { baseUrl: 'https://lh3.example/b', mimeType: 'video/mp4', filename: 'b.mp4' },
            },
            // No baseUrl: unusable, so it must be dropped rather than queued.
            { id: 'c', type: 'PHOTO', mediaFile: { mimeType: 'image/jpeg' } },
          ],
        }),
      )

    const items = await listPickedItems('account-1', 'sessions/abc')

    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(items[1]?.kind).toBe('video')
    expect(fetchMock.mock.calls[1][0]).toContain('pageToken=page-2')
    expect(fetchMock.mock.calls[0][0]).toContain('sessionId=sessions%2Fabc')
  })
})
