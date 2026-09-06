import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Server-side only (imports node:fs). Walks up from `from` to the workspace root
 * — the directory holding pnpm-workspace.yaml — so apps can resolve media/,
 * renders/ and .env no matter which package they were started from.
 */
export function repoRoot(from: string = process.cwd()): string {
  let dir = path.resolve(from)
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(from)
    dir = parent
  }
}
