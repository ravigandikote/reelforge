'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

export function ProduceButton({ projectId, hasFilms }: { projectId: string; hasFilms: boolean }) {
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { update, log } = useJobStream(jobId, () => router.refresh())

  const running = Boolean(jobId) && update?.status !== 'succeeded' && update?.status !== 'failed'

  async function produce(replan: boolean) {
    setError(null)
    setJobId(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/produce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replan }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not start')
      setJobId(body.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start')
    }
  }

  return (
    <div className="min-w-[16rem] space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="accent" disabled={running} onClick={() => void produce(false)}>
          {running ? 'Working…' : hasFilms ? 'Make them again' : 'Make the films'}
        </Button>
        {hasFilms && (
          <Button variant="outline" size="sm" disabled={running} onClick={() => void produce(true)}>
            Re-plan first
          </Button>
        )}
      </div>

      {update && (
        <div className="space-y-1">
          <ProgressBar value={update.progress} tone={update.level === 'error' ? 'error' : 'accent'} />
          <p className="font-caption text-xs text-indigo/70">{update.message}</p>
          {log
            .filter((entry) => entry.level !== 'info')
            .slice(-3)
            .map((entry, index) => (
              <p
                key={index}
                className={`font-caption text-[11px] ${entry.level === 'error' ? 'text-red-800' : 'text-amber-800'}`}
              >
                {entry.message}
              </p>
            ))}
        </div>
      )}

      {error && <p className="font-caption text-xs text-red-800">{error}</p>}
    </div>
  )
}
