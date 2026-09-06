import { existsSync } from 'node:fs'
import path from 'node:path'

/** Walks up from cwd to the workspace root (the directory holding pnpm-workspace.yaml). */
export function repoRoot(from: string = process.cwd()): string {
  let dir = path.resolve(from)
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(from)
    dir = parent
  }
}

/**
 * The Prisma CLI resolves a relative `file:` URL against prisma/ (where the
 * schema lives), but the generated client sits in packages/db/generated, so the
 * same string would point somewhere else at runtime. Resolving to an absolute
 * path here keeps the CLI and every app pointed at one database file.
 */
export function resolveDatabaseUrl(url = process.env.DATABASE_URL ?? ''): string {
  if (!url.startsWith('file:')) return url
  const target = url.slice('file:'.length)
  if (path.isAbsolute(target)) return url
  return `file:${path.resolve(repoRoot(), 'prisma', target)}`
}
