import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer'
import { mediaDir } from '@reelforge/media/paths'
import { compositionId, type RenderProps } from './props.js'
import { webpackOverride } from './webpack.js'

export interface RenderOptions {
  props: RenderProps
  outputPath: string
  /** 0..1, called as frames complete. */
  onProgress?: (progress: number) => void
  /** Defaults to the configured media library, which is what staticFile() resolves against. */
  publicDir?: string
  concurrency?: number
}

/**
 * Bundling is the slow part, so it happens once per media library and is reused
 * for every target — the four cuts of one project share a bundle. The cache is
 * keyed by public directory because the bundler copies that directory into the
 * bundle: one cached promise would serve the wrong files to a second library.
 */
const bundles = new Map<string, Promise<string>>()

export function bundleFilm(publicDir?: string): Promise<string> {
  const dir = publicDir ?? mediaDir()
  let existing = bundles.get(dir)
  if (!existing) {
    existing = bundle({
      entryPoint: fileURLToPath(new URL('./index.ts', import.meta.url)),
      publicDir: dir,
      webpackOverride,
      onProgress: () => undefined,
    })
    bundles.set(dir, existing)
  }
  return existing
}

export async function renderFilm(options: RenderOptions): Promise<{ durationInFrames: number }> {
  // MEDIA_DIR decides where the library lives; the renderer has to serve from
  // the same place the ingest wrote to.
  const publicDir = options.publicDir ?? mediaDir()
  // Remotion downloads its own Chrome Headless Shell unless one is provided;
  // REMOTION_BROWSER_EXECUTABLE points it at a system browser instead.
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null
  if (!browserExecutable) await ensureBrowser()

  const serveUrl = await bundleFilm(publicDir)
  if (process.env.REELFORGE_DEBUG_BUNDLE) {
    }

  const composition = await selectComposition({
    serveUrl,
    id: compositionId(options.props.target),
    inputProps: options.props,
    browserExecutable,
  })

  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: options.outputPath,
    inputProps: options.props,
    browserExecutable,
    concurrency: options.concurrency,
    // Reels and Shorts are re-encoded on upload anyway; this is a good balance
    // between file size and holding up under that second pass.
    crf: 20,
    x264Preset: 'medium',
    onProgress: ({ progress }) => options.onProgress?.(progress),
    chromiumOptions: { gl: 'angle' },
  })

  return { durationInFrames: composition.durationInFrames }
}
