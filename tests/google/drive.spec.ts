import { describe, expect, it } from 'vitest'
import { parseFolderId } from '@reelforge/google'

describe('parseFolderId', () => {
  it('reads the id out of a folder URL', () => {
    expect(parseFolderId('https://drive.google.com/drive/folders/1A2b3C4d5E6f7G8h9I0jKlMnOpQ')).toBe(
      '1A2b3C4d5E6f7G8h9I0jKlMnOpQ',
    )
  })

  it('handles the /drive/u/0/folders/ form', () => {
    expect(parseFolderId('https://drive.google.com/drive/u/0/folders/1A2b3C4d5E6f7G8h9I0jKl')).toBe(
      '1A2b3C4d5E6f7G8h9I0jKl',
    )
  })

  it('handles an open?id= link', () => {
    expect(parseFolderId('https://drive.google.com/open?id=1A2b3C4d5E6f7G8h9I0jKl')).toBe(
      '1A2b3C4d5E6f7G8h9I0jKl',
    )
  })

  it('accepts a bare id and trims whitespace', () => {
    expect(parseFolderId('  1A2b3C4d5E6f7G8h9I0jKl  ')).toBe('1A2b3C4d5E6f7G8h9I0jKl')
  })

  it('rejects anything that is not a folder reference', () => {
    expect(parseFolderId('')).toBeNull()
    expect(parseFolderId('not a link')).toBeNull()
    expect(parseFolderId('https://example.com/photos')).toBeNull()
  })

  it('ignores query strings after the id', () => {
    expect(parseFolderId('https://drive.google.com/drive/folders/1A2b3C4d5E6f7G8h9I0jKl?usp=sharing')).toBe(
      '1A2b3C4d5E6f7G8h9I0jKl',
    )
  })
})
