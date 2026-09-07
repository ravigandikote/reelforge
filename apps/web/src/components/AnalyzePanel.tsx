'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

type Scope = 'unanalyzed' | 'all'

interface Estimate {
  model: string
  modelLabel: string
  assets: number
  photos: number
  videos: number
  inputTokens: number
  outputTokens: number
  usd: number
  inputPerMTok: number
  outputPerMTok: number
  effort: string
}

/**
 * The vision pass costs real money, so nothing runs until the estimate has been
 * shown and confirmed. The estimate is recomputed whenever the scope changes.
 */
export function AnalyzePanel({
  unanalyzedCount,
  total,
  defaultOpen = false,
}: {
  unanalyzedCount: number
  total: number
  /** /library?analyze=1 opens the panel straight onto the estimate. */
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [scope, setScope] = useState<Scope>('unanalyzed')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [open, setOpen] = useState(defaultOpen)

  const { update, log } = useJobStream(jobId, () => router.refresh())

  const fetchEstimate = useCallback(async (next: Scope) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/analyze/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: next }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not estimate')
      setEstimate(body.estimate)
      setConfigured(body.configured)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not estimate')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void fetchEstimate(scope)
  }, [open, scope, fetchEstimate])

  async function run() {
    setError(null)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not start')
      setJobId(body.jobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start')
    }
  }

  if (total === 0) return null

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo/15 bg-white/40 px-5 py-3">
        <p className="font-caption text-sm text-indigo/70">
          {unanalyzedCount > 0
            ? `${unanalyzedCount} asset${unanalyzedCount === 1 ? '' : 's'} have no AI description yet.`
            : 'Every asset has an AI description.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Describe with AI
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo/15 bg-white/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold">Describe with AI</p>
          <p className="font-caption text-sm text-indigo/60">
            One vision call per asset: a one-line description, tags, a people count, and the focal
            point used to crop landscape shots to vertical.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ['unanalyzed', `Not yet described (${unanalyzedCount})`],
            ['all', `Everything (${total})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            className={`rounded-full px-3 py-1 font-caption text-xs transition-colors ${
              scope === value ? 'bg-indigo text-cream' : 'bg-indigo/8 text-indigo/70 hover:bg-indigo/15'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!configured && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 font-caption text-sm text-amber-900">
          <code className="font-mono">ANTHROPIC_API_KEY</code> is not set. Add it to{' '}
          <code className="font-mono">.env</code> and restart to run a batch.
        </p>
      )}

      {loading && <p className="font-caption text-sm text-indigo/50">Estimating…</p>}

      {estimate && !loading && (
        <div className="rounded-md border border-indigo/15 bg-white/60 p-4 font-caption text-sm">
          {estimate.assets === 0 ? (
            <p className="text-indigo/60">Nothing to describe in this scope.</p>
          ) : (
            <>
              <p className="text-indigo/80">
                <strong className="font-display text-base">
                  about ${estimate.usd < 0.01 ? estimate.usd.toFixed(4) : estimate.usd.toFixed(2)}
                </strong>{' '}
                for {estimate.assets} asset{estimate.assets === 1 ? '' : 's'} ({estimate.photos} photo
                {estimate.photos === 1 ? '' : 's'}, {estimate.videos} video
                {estimate.videos === 1 ? '' : 's'} × 3 frames)
              </p>
              <p className="mt-1 text-xs text-indigo/50">
                {estimate.modelLabel} at effort {estimate.effort} · ~
                {estimate.inputTokens.toLocaleString()} input + ~{estimate.outputTokens.toLocaleString()}{' '}
                output tokens · ${estimate.inputPerMTok}/${estimate.outputPerMTok} per M. This is a
                ceiling — prompt caching across the batch usually beats it.
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="accent"
          disabled={!configured || !estimate || estimate.assets === 0 || Boolean(jobId && !update)}
          onClick={() => void run()}
        >
          Run and spend it
        </Button>
        <span className="font-caption text-xs text-indigo/50">
          Assets keep any tags you set by hand.
        </span>
      </div>

      {update && (
        <div className="space-y-1">
          <ProgressBar value={update.progress} tone={update.level === 'error' ? 'error' : 'accent'} />
          <p className="font-caption text-xs text-indigo/70">{update.message}</p>
          {log.filter((e) => e.level === 'warn').length > 0 && (
            <ul className="mt-1 space-y-0.5 font-caption text-xs text-amber-800">
              {log
                .filter((e) => e.level === 'warn')
                .slice(-4)
                .map((entry, index) => (
                  <li key={index}>· {entry.message}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="font-caption text-xs text-red-800">{error}</p>}
    </div>
  )
}
