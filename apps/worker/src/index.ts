import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { prisma, repoRoot } from '@reelforge/db'

// The worker runs with cwd = apps/worker, so point dotenv at the root .env.
loadEnv({ path: path.join(repoRoot(), '.env') })

const { getEnv } = await import('@reelforge/shared/env')
const { QUEUE_NAMES } = await import('@reelforge/shared')
const { registerWorker } = await import('./queues.js')
const { markStatus, report } = await import('./progress.js')
const { runIngest } = await import('./jobs/ingest.js')
const { runAnalyze } = await import('./jobs/analyze.js')

const env = getEnv()

/**
 * Build steps 5–8 replace the remaining placeholders one queue at a time. Each
 * keeps the same contract: mark the job running, report progress, mark it
 * succeeded or failed.
 */
function placeholder(queue: string, step: string) {
  return async (job: { data: { jobId?: string } }) => {
    const jobId = job.data?.jobId
    const note = `${queue} is not implemented yet (build ${step})`
    if (jobId) {
      await markStatus(jobId, 'running')
      await report(jobId, 0, note, { level: 'warn' })
      await markStatus(jobId, 'failed', { error: note })
    }
    throw new Error(note)
  }
}

const workers = [
  registerWorker(QUEUE_NAMES.ingest, (job) => runIngest(job.data), 2),
  registerWorker(QUEUE_NAMES.analyze, (job) => runAnalyze(job.data), 1),
  registerWorker(QUEUE_NAMES.plan, placeholder('plan', 'step 5'), 1),
  registerWorker(QUEUE_NAMES.tts, placeholder('tts', 'step 7'), 1),
  registerWorker(QUEUE_NAMES.render, placeholder('render', 'step 6'), env.RENDER_CONCURRENCY),
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
