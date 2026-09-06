import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { repoRoot } from '@reelforge/shared/paths'

/** Absolute path of a configured directory, resolved against the repo root. */
export function resolveDir(envValue: string | undefined, fallback: string): string {
  const value = envValue && envValue.length > 0 ? envValue : fallback
  return path.isAbsolute(value) ? value : path.resolve(repoRoot(), value)
}

export function mediaDir(): string {
  return resolveDir(process.env.MEDIA_DIR, './media')
}

export function rendersDir(): string {
  return resolveDir(process.env.RENDERS_DIR, './renders')
}

export function stagingDir(): string {
  return path.join(resolveDir(undefined, './tmp'), 'uploads')
}

/** Everything for one asset lives together: original, thumbnail, proxy. */
export function assetDir(assetId: string): string {
  return path.join(mediaDir(), assetId)
}

export async function ensureDir(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  return dir
}

/** Paths are stored relative to the repo root so the database stays portable. */
export function toRelative(absolutePath: string): string {
  return path.relative(repoRoot(), absolutePath).split(path.sep).join('/')
}

export function toAbsolute(relativePath: string): string {
  return path.isAbsolute(relativePath) ? relativePath : path.resolve(repoRoot(), relativePath)
}
