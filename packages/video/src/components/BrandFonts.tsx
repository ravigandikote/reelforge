import { useEffect, useState } from 'react'
import { continueRender, delayRender } from 'remotion'
import { loadBrandFonts } from '../fonts.js'

/**
 * Holds the render until the brand faces are loaded. Without the delay, the
 * first frames would be laid out in a fallback font and the type would jump.
 */
export function BrandFonts() {
  const [handle] = useState(() => delayRender('Loading brand fonts'))

  useEffect(() => {
    loadBrandFonts()
      .catch(() => undefined)
      .finally(() => continueRender(handle))
  }, [handle])

  return null
}
