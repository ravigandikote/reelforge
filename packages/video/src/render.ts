import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundle } from '@remotion/bundler'
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer'
import { repoRoot } from '@reelforge/shared/paths'
import { compositionId, type RenderProps } from './props.js'
import { webpackOverride } from './webpack.js'

export interface RenderOptions {
  props: RenderProps
  outputPath: string
  /** 0..1, called as frames complete. */
  onProgress?: (progress: number) => void
  /** Defaults to the repo's media/ folder, which is what staticFile() resolves against. */
  publicDir?: string
  concurrency?: number
}

let bundlePromise: Promise<string> | null = null

/**
 * Bundling is the slow part, so it happens once per process and is reused for
 * every target — the four cuts of one project share a bundle.
 */
export function bundleFilm(publicDir?: string): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: fileURLToPath(new URL('./index.ts', import.meta.url)),
    publicDir: publicDir ?? path.join(repoRoot(), 'media'),
    webpackOverride,
    onProgress: () => undefined,
  })
  return bundlePromise
}

export async function renderFilm(options: RenderOptions): Promise<{ durationInFrames: number }> {
  const publicDir = options.publicDir ?? path.join(repoRoot(), 'media')
  // Remotion downloads its own Chrome Headless Shell unless one is provided;
  // REMOTION_BROWSER_EXECUTABLE points it at a system browser instead.
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null
  if (!browserExecutable) await ensureBrowser()

  const serveUrl = await bundleFilm(publicDir)

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
