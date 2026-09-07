import { Queue, Worker, type Processor } from 'bullmq'
import { QUEUE_NAMES } from '@reelforge/shared'
import { connection, createConnection } from './redis.js'

export const queues = {
  ingest: new Queue(QUEUE_NAMES.ingest, { connection }),
  analyze: new Queue(QUEUE_NAMES.analyze, { connection }),
  plan: new Queue(QUEUE_NAMES.plan, { connection }),
  tts: new Queue(QUEUE_NAMES.tts, { connection }),
  render: new Queue(QUEUE_NAMES.render, { connection }),
  pipeline: new Queue(QUEUE_NAMES.pipeline, { connection }),
}

/** Each worker gets its own blocking connection — BullMQ cannot share one. */
export function registerWorker<T>(
  name: string,
  processor: Processor<T>,
  concurrency = 1,
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: createConnection(),
    concurrency,
  })
  worker.on('failed', (job, err) => {
    console.error(`[${name}] job ${job?.id} failed:`, err.message)
  })
  return worker
}
