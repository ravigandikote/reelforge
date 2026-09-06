#!/usr/bin/env node
/**
 * One-shot local setup: .env with generated secrets, working directories,
 * Prisma client + migration + seed. Safe to re-run — it never overwrites an
 * existing secret.
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')

async function ensureEnv() {
  if (!existsSync(envPath)) {
    await writeFile(envPath, await readFile(path.join(root, '.env.example'), 'utf8'))
    console.log('✓ created .env from .env.example')
  }

  let env = await readFile(envPath, 'utf8')
  const fill = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm')
    if (!re.test(env)) {
      env += `\n${key}=${value}\n`
      console.log(`✓ added ${key}`)
      return
    }
    const current = env.match(re)[0].slice(key.length + 1).trim()
    if (current) return
    env = env.replace(re, `${key}=${value}`)
    console.log(`✓ generated ${key}`)
  }

  fill('ENCRYPTION_KEY', randomBytes(32).toString('base64'))
  fill('SESSION_SECRET', randomBytes(32).toString('hex'))
  await writeFile(envPath, env)
}

async function ensureDirs() {
  for (const dir of ['media', 'renders', 'assets/music', 'tmp']) {
    await mkdir(path.join(root, dir), { recursive: true })
  }
  console.log('✓ media/ renders/ tmp/ ready')
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

await ensureEnv()
await ensureDirs()
run('pnpm', ['exec', 'prisma', 'generate'])
run('pnpm', ['exec', 'prisma', 'migrate', 'dev', '--name', 'init', '--skip-seed'])
run('pnpm', ['exec', 'tsx', 'prisma/seed.ts'])

console.log(`
Setup complete.

  1. Add your API keys to .env (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY,
     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — see README for the console steps).
  2. pnpm dev
`)
