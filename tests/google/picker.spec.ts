import { describe, expect, it } from 'vitest'
import { downloadUrl, extensionForMime, toPickedItem } from '@reelforge/google'

const photo = {
  id: 'item-1',
  createTime: '2026-01-14T10:00:00Z',
  type: 'PHOTO',
  mediaFile: {
    baseUrl: 'https://lh3.googleusercontent.com/abc',
    mimeType: 'image/jpeg',
    filename: 'stage.jpg',
    mediaFileMetadata: { width: '4032', height: '3024' },
  },
}

describe('toPickedItem', () => {
  it('maps a picked photo', () => {
    expect(toPickedItem(photo)).toEqual({
      id: 'item-1',
      name: 'stage.jpg',
      mimeType: 'image/jpeg',
      kind: 'photo',
      url: 'https://lh3.googleusercontent.com/abc',
      createTime: '2026-01-14T10:00:00Z',
      width: 4032,
      height: 3024,
    })
  })

  it('classifies video by type or mime', () => {
    expect(toPickedItem({ ...photo, type: 'VIDEO' })?.kind).toBe('video')
    expect(
      toPickedItem({ ...photo, type: undefined, mediaFile: { ...photo.mediaFile, mimeType: 'video/mp4' } })
        ?.kind,
    ).toBe('video')
  })

  it('invents a filename when Google omits one', () => {
    const item = toPickedItem({ ...photo, mediaFile: { ...photo.mediaFile, filename: undefined } })
    expect(item?.name).toBe('item-1.jpg')
  })

  it('drops items with no baseUrl rather than queueing a broken download', () => {
    expect(toPickedItem({ ...photo, mediaFile: { ...photo.mediaFile, baseUrl: undefined } })).toBeNull()
    expect(toPickedItem({ ...photo, id: undefined })).toBeNull()
  })
})

describe('downloadUrl', () => {
  it('asks for original bytes: =d for photos, =dv for video', () => {
    // Without the suffix Google returns a stripped, resized preview.
    expect(downloadUrl({ url: 'https://lh3.googleusercontent.com/abc', kind: 'photo' })).toBe(
      'https://lh3.googleusercontent.com/abc=d',
    )
    expect(downloadUrl({ url: 'https://lh3.googleusercontent.com/abc', kind: 'video' })).toBe(
      'https://lh3.googleusercontent.com/abc=dv',
    )
  })
})

describe('extensionForMime', () => {
  it('maps known types and falls back by kind', () => {
    expect(extensionForMime('image/jpeg', 'photo')).toBe('.jpg')
    expect(extensionForMime('video/quicktime', 'video')).toBe('.mov')
    expect(extensionForMime('application/octet-stream', 'video')).toBe('.mp4')
    expect(extensionForMime('', 'photo')).toBe('.jpg')
  })
})
