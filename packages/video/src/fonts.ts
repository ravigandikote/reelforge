import fraunces from '../fonts/Fraunces-SemiBold.woff2'
import marcellus from '../fonts/Marcellus-Regular.woff2'
import poppinsMedium from '../fonts/Poppins-Medium.woff2'
import poppinsSemiBold from '../fonts/Poppins-SemiBold.woff2'

/**
 * The brand faces are bundled rather than fetched from Google at render time.
 * A renderer that reaches the network mid-frame is a renderer that fails on a
 * bad connection and silently swaps in a system font — and every frame of a
 * 90-second cut would race that fetch. The files are the same Google Fonts
 * releases (all SIL Open Font License); `pnpm fonts:fetch` re-downloads them.
 */
export const FONTS = {
  display: 'Fraunces',
  body: 'Marcellus',
  caption: 'Poppins',
}

interface FaceSpec {
  family: string
  url: string
  weight: string
}

export const FACES: FaceSpec[] = [
  { family: FONTS.display, url: fraunces, weight: '600' },
  { family: FONTS.body, url: marcellus, weight: '400' },
  { family: FONTS.caption, url: poppinsMedium, weight: '500' },
  { family: FONTS.caption, url: poppinsSemiBold, weight: '600' },
]

/** Loads every face and resolves once they are actually usable for layout. */
export async function loadBrandFonts(): Promise<void> {
  await Promise.all(
    FACES.map(async (face) => {
      const fontFace = new FontFace(face.family, `url(${face.url}) format('woff2')`, {
        weight: face.weight,
        display: 'block',
      })
      await fontFace.load()
      document.fonts.add(fontFace)
    }),
  )
}
