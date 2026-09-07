'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Re-plans one shot without touching the rest of the edit. The slot keeps its
 * length, so nothing after it moves.
 */
export function RegenerateButton({ segmentId }: { segmentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function regenerate() {
    const note = window.prompt(
      'What should be different about this shot? (optional — leave blank for another take)',
      '',
    )
    if (note === null) return

    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/segments/${segmentId}/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: note.trim() || null }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not re-plan')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-plan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={busy}
        title="Re-plan this shot"
        className="rounded px-1.5 py-0.5 font-caption text-[11px] text-indigo/50 transition-colors hover:bg-indigo/8 hover:text-indigo disabled:opacity-50"
      >
        {busy ? '…' : '↻'}
      </button>
      {error && <span className="max-w-[10rem] font-caption text-[10px] text-red-800">{error}</span>}
    </span>
  )
}
