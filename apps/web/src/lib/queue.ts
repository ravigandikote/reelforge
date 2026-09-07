import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { QUEUE_NAMES } from '@reelforge/shared'
import { getEnv } from '@reelforge/shared/env'

/**
 * Producer-side queue handles. The web app only enqueues — every long-running
 * step (ingest, analyse, plan, tts, render) executes in apps/worker.
 */
const globalForQueues = globalThis as unknown as {
  reelforgeConnection?: IORedis
  reelforgeQueues?: Record<keyof typeof QUEUE_NAMES, Queue>
}

function connection(): IORedis {
  globalForQueues.reelforgeConnection ??= new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
  })
  return globalForQueues.reelforgeConnection
}

export function getQueues() {
  globalForQueues.reelforgeQueues ??= {
    ingest: new Queue(QUEUE_NAMES.ingest, { connection: connection() }),
    analyze: new Queue(QUEUE_NAMES.analyze, { connection: connection() }),
    plan: new Queue(QUEUE_NAMES.plan, { connection: connection() }),
    tts: new Queue(QUEUE_NAMES.tts, { connection: connection() }),
    render: new Queue(QUEUE_NAMES.render, { connection: connection() }),
    pipeline: new Queue(QUEUE_NAMES.pipeline, { connection: connection() }),
  }
  return globalForQueues.reelforgeQueues
}

export async function redisReachable(): Promise<boolean> {
  try {
    const pong = await connection().ping()
    return pong === 'PONG'
  } catch {
    return false
  }
}
