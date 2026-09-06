'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { formatBytes, formatDate, formatDuration } from '@/lib/format'

export interface AssetSummary {
  id: string
  kind: string
  originalName: string
  width: number
  height: number
  orientation: string
  durationSec: number | null
  bytes: number
  capturedAt: string | null
  consentCleared: boolean
  hasIndianFlag: boolean
  dominantColors: string[]
  hasThumb: boolean
}

export function AssetCard({ asset }: { asset: AssetSummary }) {
  const router = useRouter()
  const [cleared, setCleared] = useState(asset.consentCleared)
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)

  const duration = formatDuration(asset.durationSec)
  const captured = formatDate(asset.capturedAt)

  async function toggleConsent() {
    const next = !cleared
    setCleared(next)
    setSaving(true)
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ consentCleared: next }),
      })
      if (!response.ok) throw new Error('Update failed')
      startTransition(() => router.refresh())
    } catch {
      setCleared(!next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <figure className="group overflow-hidden rounded-lg border border-indigo/10 bg-white/60">
      <div
        className="relative aspect-[4/3] w-full overflow-hidden bg-indigo/5"
        style={{ backgroundColor: asset.dominantColors[0] ?? undefined }}
      >
        {asset.hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/media/${asset.id}/thumb`}
            alt={asset.originalName}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-caption text-xs text-indigo/50">
            No preview
          </div>
        )}

        <div className="absolute left-2 top-2 flex gap-1">
          <Badge variant="muted" className="bg-white/85 backdrop-blur">
            {asset.orientation}
          </Badge>
          {duration && (
            <Badge variant="muted" className="bg-white/85 backdrop-blur tabular-nums">
              {duration}
            </Badge>
          )}
        </div>

        {asset.kind === 'video' && (
          <span className="absolute right-2 top-2 rounded-full bg-indigo/80 px-2 py-0.5 font-caption text-[10px] uppercase tracking-wider text-cream">
            video
          </span>
        )}
      </div>

      <figcaption className="space-y-2 p-3">
        <p className="truncate font-caption text-sm" title={asset.originalName}>
          {asset.originalName}
        </p>
        <p className="font-caption text-xs text-indigo/50">
          {asset.width}×{asset.height} · {formatBytes(asset.bytes)}
          {captured ? ` · ${captured}` : ''}
        </p>

        <button
          type="button"
          onClick={toggleConsent}
          disabled={saving || pending}
          className={`w-full rounded-md px-2 py-1.5 font-caption text-xs font-medium transition-colors disabled:opacity-60 ${
            cleared
              ? 'bg-emerald-600/15 text-emerald-900 hover:bg-emerald-600/25'
              : 'bg-amber-500/15 text-amber-900 hover:bg-amber-500/25'
          }`}
        >
          {cleared ? '✓ Consent cleared' : 'Not cleared — click to clear'}
        </button>
      </figcaption>
    </figure>
  )
}
