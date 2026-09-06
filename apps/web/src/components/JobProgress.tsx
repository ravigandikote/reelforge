'use client'

import { useEffect, useState } from 'react'

export interface JobUpdate {
  status: string
  progress: number
  message: string
  level: 'info' | 'warn' | 'error'
}

/**
 * Subscribes to /api/jobs/<id>/stream. The server replays every JobEvent from
 * the start, so mounting late (or after a reload) still shows the full trail.
 */
export function useJobStream(jobId: string | null, onDone?: (status: string) => void) {
  const [update, setUpdate] = useState<JobUpdate | null>(null)
  const [log, setLog] = useState<JobUpdate[]>([])

  useEffect(() => {
    if (!jobId) return
    setLog([])
    setUpdate(null)

    const source = new EventSource(`/api/jobs/${jobId}/stream`)

    source.addEventListener('progress', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as JobUpdate
      setUpdate(data)
      setLog((previous) => [...previous.slice(-40), data])
    })

    source.addEventListener('done', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as JobUpdate
      setUpdate(data)
      source.close()
      onDone?.(data.status)
    })

    source.addEventListener('error', () => {
      // EventSource retries on its own; the job row stays the source of truth.
    })

    return () => source.close()
    // onDone is intentionally not a dependency: a new identity per render would
    // tear down and reopen the stream on every parent update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  return { update, log }
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'error' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-indigo/10">
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${
          tone === 'error' ? 'bg-red-700' : 'bg-terracotta'
        }`}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  )
}
