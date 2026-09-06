#!/usr/bin/env node
/**
 * `pnpm dev` — brings up Redis, verifies the Prisma client, then runs the web
 * app and the worker together with prefixed, colour-coded output.
 * Ctrl-C stops both children; Redis is left running (`pnpm redis:down` stops it).
 */
import { spawn, spawnSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnv({ path: path.join(root, '.env') })
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379)

const color = { web: '\x1b[36m', worker: '\x1b[35m', dev: '\x1b[33m', reset: '\x1b[0m' }
const log = (who, msg) => console.log(`${color[who] ?? ''}[${who}]${color.reset} ${msg}`)

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.setTimeout(400)
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('timeout', () => (socket.destroy(), resolve(false)))
    socket.once('error', () => resolve(false))
  })
}

async function ensureRedis() {
  if (await portOpen(REDIS_PORT)) {
    log('dev', `Redis already listening on :${REDIS_PORT}`)
    return
  }
  log('dev', 'starting Redis (docker compose up -d redis)…')
  const res = spawnSync('docker', ['compose', 'up', '-d', 'redis'], { cwd: root, stdio: 'inherit' })
  if (res.status !== 0) {
    log('dev', 'Could not start Redis via Docker. Start it yourself, or set REDIS_URL to a running instance.')
    process.exit(1)
  }
  for (let i = 0; i < 30; i++) {
    if (await portOpen(REDIS_PORT)) return log('dev', `Redis ready on :${REDIS_PORT}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  log('dev', `Redis did not accept connections on :${REDIS_PORT} within 15s`)
  process.exit(1)
}

function ensurePrismaClient() {
  if (existsSync(path.join(root, 'packages/db/generated/client'))) return
  log('dev', 'generating Prisma client…')
  const res = spawnSync('pnpm', ['exec', 'prisma', 'generate'], { cwd: root, stdio: 'inherit' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

function ensureEnv() {
  if (existsSync(path.join(root, '.env'))) return
  log('dev', 'No .env found. Run `pnpm setup` first.')
  process.exit(1)
}

const children = []
function start(name, filter) {
  const child = spawn('pnpm', ['--filter', filter, 'dev'], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const pipe = (stream) => {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) log(name, line)
    })
  }
  pipe(child.stdout)
  pipe(child.stderr)
  child.on('exit', (code) => {
    log(name, `exited with code ${code}`)
    shutdown(code ?? 0)
  })
  children.push(child)
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 300)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

ensureEnv()
await ensureRedis()
ensurePrismaClient()
start('web', '@reelforge/web')
start('worker', '@reelforge/worker')
log('dev', `web → http://localhost:${process.env.WEB_PORT ?? 3000}`)
