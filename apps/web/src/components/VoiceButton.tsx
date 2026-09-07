'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

export function VoiceButton({ edlId, hasVoice }: { edlId: string; hasVoice: boolean }) {
  const router = useRouter()
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { update, log } = useJobStream(jobId, () => router.refresh())

  const running = Boolean(jobId) && update?.status !== 'succeeded' && update?.status !== 'failed'

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={running}
        onClick={async () => {
          setError(null)
          try {
            const response = await fetch(`/api/edls/${edlId}/voice`, { method: 'POST' })
            const body = await response.json()
            if (!response.ok) throw new Error(body.error ?? 'Could not start')
            setJobId(body.jobId)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start')
          }
        }}
      >
        {running ? 'Recording…' : hasVoice ? 'Redo voiceover' : 'Voiceover & captions'}
      </Button>

      {update && (
        <span className="block w-56">
          <ProgressBar value={update.progress} tone={update.level === 'error' ? 'error' : 'accent'} />
          <span className="mt-1 block font-caption text-[11px] text-indigo/60">{update.message}</span>
          {log
            .filter((entry) => entry.level === 'warn')
            .slice(-2)
            .map((entry, index) => (
              <span key={index} className="mt-0.5 block font-caption text-[11px] text-amber-800">
                {entry.message}
              </span>
            ))}
        </span>
      )}
      {error && <span className="font-caption text-[11px] text-red-800">{error}</span>}
    </span>
  )
}
