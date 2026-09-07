import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { prisma, repoRoot } from '@reelforge/db'

// The worker runs with cwd = apps/worker, so point dotenv at the root .env.
loadEnv({ path: path.join(repoRoot(), '.env') })

const { getEnv } = await import('@reelforge/shared/env')
const { QUEUE_NAMES } = await import('@reelforge/shared')
const { registerWorker } = await import('./queues.js')
const { runIngest } = await import('./jobs/ingest.js')
const { runAnalyze } = await import('./jobs/analyze.js')
const { runPlan } = await import('./jobs/plan.js')
const { runTts } = await import('./jobs/tts.js')
const { runRender } = await import('./jobs/render.js')
const { runPipeline } = await import('./jobs/pipeline.js')

const env = getEnv()

const workers = [
  registerWorker(QUEUE_NAMES.ingest, (job) => runIngest(job.data), 2),
  registerWorker(QUEUE_NAMES.analyze, (job) => runAnalyze(job.data), 1),
  registerWorker(QUEUE_NAMES.plan, (job) => runPlan(job.data), 1),
  registerWorker(QUEUE_NAMES.tts, (job) => runTts(job.data), 1),
  registerWorker(QUEUE_NAMES.render, (job) => runRender(job.data), env.RENDER_CONCURRENCY),
  registerWorker(QUEUE_NAMES.pipeline, (job) => runPipeline(job.data), 1),
]

async function main() {
  await prisma.$queryRaw`SELECT 1`
  const { ffmpegPath, ffprobePath } = await import('@reelforge/media')
  console.log(`ReelForge worker ready — redis ${env.REDIS_URL}`)
  console.log(`  queues: ${Object.values(QUEUE_NAMES).join(', ')}`)
  console.log(`  ffmpeg: ${ffmpegPath}`)
  console.log(`  ffprobe: ${ffprobePath}`)
  console.log(`  render concurrency: ${env.RENDER_CONCURRENCY}`)
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received, draining workers…`)
  await Promise.all(workers.map((w) => w.close()))
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch((err) => {
  console.error('Worker failed to start:', err)
  process.exit(1)
})
