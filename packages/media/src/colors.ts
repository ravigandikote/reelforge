import sharp from 'sharp'

/**
 * Dominant colours, coarse on purpose: the palette is a planning hint (does this
 * shot read warm/night/green?), not a colour-grade. Pixels are quantised into
 * 16-per-channel buckets, then each surviving bucket is averaged back to a real
 * colour so the hex is one that actually appears in the frame.
 */
export async function dominantColors(input: string | Buffer, count = 4): Promise<string[]> {
  const { data, info } = await sharp(input)
    .resize(64, 64, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  const channels = info.channels

  for (let i = 0; i + channels - 1 < data.length; i += channels) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n += 1
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(({ r, g, b, n }) => rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)))
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
