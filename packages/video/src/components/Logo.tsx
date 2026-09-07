import { Img, staticFile } from 'remotion'
import type { Brand } from '../props.js'

/**
 * The tree emblem, drawn rather than loaded when no logo file is present, so a
 * fresh clone renders something on-brand instead of a broken image. Drop the
 * real lockups into assets/ and point the brand kit at them.
 */
export function TreeMark({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <path
        d="M32 6c-9 6-14 13-14 20 0 6 4 11 10 13l-2 19h12l-2-19c6-2 10-7 10-13 0-7-5-14-14-20z"
        fill={color}
      />
      <path d="M20 44c4 3 8 4 12 4s8-1 12-4" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

/** Below this width the full lockup is replaced by the emblem alone. */
const MARK_ONLY_BELOW = 120

export function LogoBug({
  brand,
  width,
  color,
}: {
  brand: Brand
  width: number
  color: string
}) {
  const source = width < MARK_ONLY_BELOW ? brand.logoMarkSrc : brand.logoSrc

  if (source) {
    return (
      <Img
        src={staticFile(source)}
        style={{ width, height: 'auto', opacity: 0.92 }}
      />
    )
  }

  return <TreeMark size={Math.min(width, MARK_ONLY_BELOW)} color={color} />
}
