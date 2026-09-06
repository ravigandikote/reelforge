import { prisma } from '@reelforge/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLL_MS = 400
const TERMINAL = ['succeeded', 'failed', 'cancelled']

/**
 * Progress is streamed from the JobEvent table rather than from the queue, so a
 * reload replays everything that already happened and a worker restart does not
 * lose the trail.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const jobId = params.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let cursor: Date | null = null
      let closed = false

      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(timer)
        try {
          controller.close()
        } catch {
          // The client hung up first; nothing to do.
        }
      }

      request.signal.addEventListener('abort', close)

      const tick = async () => {
        try {
          const job = await prisma.job.findUnique({ where: { id: jobId } })
          if (!job) {
            send('error', { message: 'Job not found' })
            return close()
          }

          const events = await prisma.jobEvent.findMany({
            where: { jobId, ...(cursor ? { createdAt: { gt: cursor } } : {}) },
            orderBy: { createdAt: 'asc' },
            take: 100,
          })

          for (const event of events) {
            cursor = event.createdAt
            send('progress', {
              jobId,
              status: job.status,
              progress: event.progress ?? job.progress,
              message: event.message,
              level: event.level,
              at: event.createdAt.toISOString(),
              data: event.dataJson ? JSON.parse(event.dataJson) : undefined,
            })
          }

          if (TERMINAL.includes(job.status)) {
            send('done', {
              jobId,
              status: job.status,
              progress: job.progress,
              message: job.error ?? job.message ?? '',
            })
            close()
          }
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'Stream failed' })
          close()
        }
      }

      const timer = setInterval(() => void tick(), POLL_MS)
      await tick()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Without this an intermediate proxy can hold the whole stream back.
      'x-accel-buffering': 'no',
    },
  })
}
