import { prisma } from '@reelforge/db'
import type { JobStatus } from '@reelforge/shared'

/**
 * Progress is written to the JobEvent table rather than pushed straight to the
 * browser, so the SSE endpoint can replay it after a reload or a worker restart.
 */
export async function report(
  jobId: string,
  progress: number,
  message: string,
  opts: { level?: 'info' | 'warn' | 'error'; data?: unknown } = {},
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))
  await prisma.$transaction([
    prisma.job.update({
      where: { id: jobId },
      data: { progress: clamped, message },
    }),
    prisma.jobEvent.create({
      data: {
        jobId,
        progress: clamped,
        message,
        level: opts.level ?? 'info',
        dataJson: opts.data === undefined ? null : JSON.stringify(opts.data),
      },
    }),
  ])
}

export async function markStatus(
  jobId: string,
  status: JobStatus,
  extra: { error?: string; costCents?: number } = {},
): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      error: extra.error ?? null,
      costCents: extra.costCents,
      startedAt: status === 'running' ? new Date() : undefined,
      finishedAt: ['succeeded', 'failed', 'cancelled'].includes(status) ? new Date() : undefined,
      progress: status === 'succeeded' ? 100 : undefined,
    },
  })
}
