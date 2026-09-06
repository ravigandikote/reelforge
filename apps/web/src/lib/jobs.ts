import { prisma } from '@reelforge/db'
import type { JobType } from '@reelforge/shared'
import { getQueues } from './queue'

/**
 * Every long-running action creates a Job row first, then enqueues. The row is
 * what the UI polls and what the SSE stream replays, so a job is visible even
 * if Redis is briefly down.
 */
export async function createJob(input: {
  type: JobType
  projectId?: string | null
  target?: string | null
  message?: string
}) {
  return prisma.job.create({
    data: {
      type: input.type,
      projectId: input.projectId ?? null,
      target: input.target ?? null,
      status: 'queued',
      message: input.message ?? 'Queued',
    },
  })
}

export async function enqueue(
  queue: keyof ReturnType<typeof getQueues>,
  name: string,
  data: unknown,
): Promise<void> {
  await getQueues()[queue].add(name, data, {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 1,
  })
}
