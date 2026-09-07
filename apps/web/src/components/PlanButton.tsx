'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

export function PlanButton({ projectId, hasPlans }: { projectId: string; hasPlans: boolean }) {
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { update, log } = useJobStream(jobId, () => router.refresh())

  async function plan() {
    setError(null)
    setJobId(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/plan`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not start planning')
      setJobId(body.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start planning')
    }
  }

  const running = Boolean(jobId) && update?.status !== 'succeeded' && update?.status !== 'failed'

  return (
    <div className="space-y-2">
      <Button variant="accent" disabled={running} onClick={() => void plan()}>
        {running ? 'Planning…' : hasPlans ? 'Re-plan the edit' : 'Plan the edit'}
      </Button>

      {update && (
        <div className="space-y-1">
          <ProgressBar value={update.progress} tone={update.level === 'error' ? 'error' : 'accent'} />
          <p className="font-caption text-xs text-indigo/70">{update.message}</p>
          {log.filter((entry) => entry.level !== 'info').length > 0 && (
            <ul className="space-y-0.5 font-caption text-xs">
              {log
                .filter((entry) => entry.level !== 'info')
                .slice(-6)
                .map((entry, index) => (
                  <li key={index} className={entry.level === 'error' ? 'text-red-800' : 'text-amber-800'}>
                    · {entry.message}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="font-caption text-xs text-red-800">{error}</p>}
    </div>
  )
}
