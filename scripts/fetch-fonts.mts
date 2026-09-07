#!/usr/bin/env tsx
/**
 * Re-downloads the brand faces into packages/video/fonts.
 *
 * They are committed rather than fetched at render time: a renderer that
 * reaches the network mid-frame fails on a bad connection and silently swaps in
 * a system font. All three families are under the SIL Open Font License, which
 * permits redistribution.
 *
 *   pnpm fonts:fetch
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { repoRoot } from '@reelforge/shared/paths'

const FACES = [
  {
    file: 'Fraunces-SemiBold.woff2',
    url: 'https://fonts.gstatic.com/s/fraunces/v38/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8.woff2',
  },
  {
    file: 'Marcellus-Regular.woff2',
    url: 'https://fonts.gstatic.com/s/marcellus/v14/wEO_EBrOk8hQLDvIAF81VvoK.woff2',
  },
  {
    file: 'Poppins-Medium.woff2',
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9Z1xlFQ.woff2',
  },
  {
    file: 'Poppins-SemiBold.woff2',
    url: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6Z1xlFQ.woff2',
  },
]

const dir = path.join(repoRoot(), 'packages/video/fonts')
await mkdir(dir, { recursive: true })

for (const face of FACES) {
  const response = await fetch(face.url, {
    // Google serves woff2 only to browsers that advertise support for it.
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
  })
  if (!response.ok) throw new Error(`${face.file}: HTTP ${response.status}`)

  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(path.join(dir, face.file), bytes)
  console.log(`✓ ${face.file} (${bytes.length} bytes)`)
}
