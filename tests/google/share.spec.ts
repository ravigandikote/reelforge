import { describe, expect, it } from 'vitest'
import { extractMediaUrls, isShareLink } from '@reelforge/google/share'

describe('share-link scraping (unsupported)', () => {
  it('recognises Google Photos share hosts only', () => {
    expect(isShareLink('https://photos.app.goo.gl/abc123')).toBe(true)
    expect(isShareLink('https://photos.google.com/share/xyz')).toBe(true)
    expect(isShareLink('https://example.com/album')).toBe(false)
    expect(isShareLink('not a url')).toBe(false)
  })

  it('pulls media URLs out of page HTML and strips size suffixes', () => {
    const html = `
      <script>["https://lh3.googleusercontent.com/${'A'.repeat(60)}=w1920-h1080",1920,1080]</script>
      <script>["https://lh5.googleusercontent.com/${'B'.repeat(60)}",800,600]</script>
    `
    const urls = extractMediaUrls(html)
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url).not.toContain('=w')
  })

  it('de-duplicates repeated URLs', () => {
    const url = `https://lh3.googleusercontent.com/${'C'.repeat(60)}`
    expect(extractMediaUrls(`${url} ${url} ${url}`)).toHaveLength(1)
  })

  it('returns nothing for a page with no media', () => {
    expect(extractMediaUrls('<html><body>Sign in to continue</body></html>')).toEqual([])
  })
})
