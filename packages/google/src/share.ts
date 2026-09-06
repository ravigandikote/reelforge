/**
 * UNSUPPORTED — public photos.app.goo.gl share-link scraping.
 *
 * Google does not document or support reading a share link this way. The page
 * is server-rendered HTML with image URLs embedded in a script payload, and both
 * the markup and the URL format change without notice. It is behind
 * ENABLE_SHARE_LINK_SCRAPER for that reason: when it breaks, use the Picker
 * instead. Nothing else in the app imports this module.
 */

export interface ScrapedItem {
  id: string
  name: string
  mimeType: string
  kind: 'photo' | 'video'
  url: string
}

const SHARE_HOSTS = ['photos.app.goo.gl', 'photos.google.com']

export function isShareLink(input: string): boolean {
  try {
    return SHARE_HOSTS.includes(new URL(input.trim()).hostname)
  } catch {
    return false
  }
}

/**
 * Pulls googleusercontent media URLs out of the share page's HTML. Album pages
 * embed each item as ["https://lh3.googleusercontent.com/...",width,height].
 */
export function extractMediaUrls(html: string): string[] {
  const pattern = /https:\/\/lh\d\.googleusercontent\.com\/[A-Za-z0-9_\-/=]{40,}/g
  const found = new Set<string>()

  for (const match of html.matchAll(pattern)) {
    // Strip any size suffix the page baked in; the caller re-adds =d / =dv.
    found.add(match[0].replace(/=[^=]*$/, ''))
  }

  return [...found]
}

export async function scrapeShareLink(url: string): Promise<ScrapedItem[]> {
  if (!isShareLink(url)) throw new Error('That does not look like a Google Photos share link')

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      // The mobile-less user agent gets the plain HTML album page.
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
  })
  if (!response.ok) throw new Error(`Could not open the share link (HTTP ${response.status})`)

  const urls = extractMediaUrls(await response.text())
  if (urls.length === 0) {
    throw new Error(
      'No media found on that page. Share-link scraping is unsupported and breaks whenever Google changes the page — use the Google Photos picker instead.',
    )
  }

  return urls.map((mediaUrl, index) => ({
    id: `share-${index}`,
    // The page carries no filenames, so these are positional.
    name: `shared-${String(index + 1).padStart(3, '0')}.jpg`,
    mimeType: 'image/jpeg',
    kind: 'photo' as const,
    url: mediaUrl,
  }))
}
