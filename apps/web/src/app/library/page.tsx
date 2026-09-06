import Link from 'next/link'
import { fromJson, prisma } from '@reelforge/db'
import { SUPPORTED_EXTENSIONS } from '@reelforge/media/mime'
import { AssetCard, type AssetSummary } from '@/components/AssetCard'
import { UploadPanel } from '@/components/UploadPanel'
import { Badge } from '@/components/ui/badge'
import { formatBytes } from '@/lib/format'

export const dynamic = 'force-dynamic'

type Filters = { kind?: string; orientation?: string; consent?: string }

const KIND_FILTERS = [
  { value: undefined, label: 'All media' },
  { value: 'photo', label: 'Photos' },
  { value: 'video', label: 'Videos' },
]

const ORIENTATION_FILTERS = [
  { value: undefined, label: 'Any shape' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
]

const CONSENT_FILTERS = [
  { value: undefined, label: 'Any consent' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'uncleared', label: 'Not cleared' },
]

function buildHref(current: Filters, key: keyof Filters, value: string | undefined) {
  const next = { ...current, [key]: value }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v)
  const query = params.toString()
  return query ? `/library?${query}` : '/library'
}

function FilterRow({
  current,
  filterKey,
  options,
}: {
  current: Filters
  filterKey: keyof Filters
  options: { value: string | undefined; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const active = (current[filterKey] ?? undefined) === option.value
        return (
          <Link
            key={option.label}
            href={buildHref(current, filterKey, option.value)}
            className={`rounded-full px-3 py-1 font-caption text-xs transition-colors ${
              active ? 'bg-indigo text-cream' : 'bg-indigo/8 text-indigo/70 hover:bg-indigo/15'
            }`}
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}

export default async function LibraryPage({ searchParams }: { searchParams: Filters }) {
  const filters: Filters = {
    kind: searchParams.kind,
    orientation: searchParams.orientation,
    consent: searchParams.consent,
  }

  const where = {
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.orientation ? { orientation: filters.orientation } : {}),
    ...(filters.consent === 'cleared'
      ? { consentCleared: true }
      : filters.consent === 'uncleared'
        ? { consentCleared: false }
        : {}),
  }

  const [assets, total, cleared, bytes] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }], take: 200 }),
    prisma.asset.count(),
    prisma.asset.count({ where: { consentCleared: true } }),
    prisma.asset.aggregate({ _sum: { bytes: true } }),
  ])

  const summaries: AssetSummary[] = assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    originalName: asset.originalName,
    width: asset.width,
    height: asset.height,
    orientation: asset.orientation,
    durationSec: asset.durationSec,
    bytes: asset.bytes,
    capturedAt: asset.capturedAt?.toISOString() ?? null,
    consentCleared: asset.consentCleared,
    hasIndianFlag: asset.hasIndianFlag,
    dominantColors: fromJson<string[]>(asset.dominantColorsJson, []),
    hasThumb: Boolean(asset.thumbPath),
  }))

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Library</h1>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            {total} asset{total === 1 ? '' : 's'} · {cleared} cleared for renders ·{' '}
            {formatBytes(bytes._sum.bytes ?? 0)} on disk
          </p>
        </div>
        {total > 0 && cleared === 0 && (
          <Badge variant="warn">Nothing is consent-cleared yet — renders will be blocked</Badge>
        )}
      </header>

      <UploadPanel accept={[...SUPPORTED_EXTENSIONS, '.zip'].join(',')} />

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <FilterRow current={filters} filterKey="kind" options={KIND_FILTERS} />
        <FilterRow current={filters} filterKey="orientation" options={ORIENTATION_FILTERS} />
        <FilterRow current={filters} filterKey="consent" options={CONSENT_FILTERS} />
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-indigo/20 p-10 text-center">
          <p className="font-display text-lg">
            {total === 0 ? 'The library is empty' : 'Nothing matches these filters'}
          </p>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            {total === 0
              ? 'Upload a few photos, a clip or a zip to get started.'
              : 'Try widening the filters above.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {summaries.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}

      {assets.length === 200 && (
        <p className="font-caption text-xs text-indigo/50">
          Showing the 200 most recent assets. Filters narrow the list.
        </p>
      )}
    </div>
  )
}
