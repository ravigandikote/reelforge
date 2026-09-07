import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fromJson, prisma } from '@reelforge/db'
import { RENDER_FORMATS, type RenderTarget } from '@reelforge/shared'
import { EdlViewer, type EdlView } from '@/components/EdlViewer'
import { ProduceButton } from '@/components/ProduceButton'
import { RenderCard, type RenderView } from '@/components/RenderCard'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface StoredPlan {
  titleText: string | null
  plan: unknown
  issues: { level: string; code: string; message: string; segment?: number }[]
  ok: boolean
}

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      edls: {
        orderBy: [{ version: 'desc' }],
        include: {
          segments: { orderBy: { index: 'asc' } },
          renders: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })
  if (!project) notFound()

  const targets = fromJson<RenderTarget[]>(project.targetsJson, [])

  // One card per target: the newest version, since re-planning keeps history.
  const newest = new Map<string, (typeof project.edls)[number]>()
  for (const edl of project.edls) if (!newest.has(edl.target)) newest.set(edl.target, edl)

  const assetIds = [...new Set(project.edls.flatMap((edl) => edl.segments.map((s) => s.assetId)))]
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, originalName: true, kind: true, hasIndianFlag: true },
  })
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))

  const views: EdlView[] = targets
    .map((target) => newest.get(target))
    .filter((edl): edl is NonNullable<typeof edl> => Boolean(edl))
    .map((edl) => {
      const stored = fromJson<StoredPlan>(edl.rawJson, {
        titleText: null,
        plan: null,
        issues: [],
        ok: true,
      })
      return {
        id: edl.id,
        hasVoice: Boolean(edl.voicePath),
        hasCaptions: Boolean(edl.srtPath),
        target: edl.target,
        label: RENDER_FORMATS[edl.target as RenderTarget]?.label ?? edl.target,
        version: edl.version,
        targetSeconds: edl.targetSeconds,
        actualSeconds: edl.actualSeconds,
        ok: stored.ok,
        model: edl.model,
        createdAt: edl.createdAt.toISOString(),
        issues: stored.issues ?? [],
        raw: stored.plan,
        segments: edl.segments.map((segment) => {
          const asset = assetById.get(segment.assetId)
          return {
            id: segment.id,
            index: segment.index,
            startSec: segment.startSec,
            endSec: segment.endSec,
            assetId: segment.assetId,
            assetName: asset?.originalName ?? segment.assetId,
            assetKind: asset?.kind ?? 'photo',
            motion: segment.motion,
            trimStartSec: segment.trimStartSec,
            captionText: segment.captionText,
            voiceoverText: segment.voiceoverText,
            hasIndianFlag: asset?.hasIndianFlag ?? false,
          }
        }),
      }
    })

  const blocked = views.filter((view) => !view.ok)

  const renders: RenderView[] = targets
    .map((target) => newest.get(target))
    .filter((edl): edl is NonNullable<typeof edl> => Boolean(edl))
    .flatMap((edl) =>
      edl.renders.map((render) => ({
        id: render.id,
        target: render.target,
        label: RENDER_FORMATS[render.target as RenderTarget]?.label ?? render.target,
        width: render.width,
        height: render.height,
        durationSec: render.durationSec,
        bytes: render.bytes,
        createdAt: render.createdAt.toISOString(),
        hasCaptions: Boolean(render.vttPath),
      })),
    )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="font-caption text-xs text-terracotta hover:underline">
            ← all projects
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold">{project.title}</h1>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            {targets.map((target) => RENDER_FORMATS[target]?.label ?? target).join(' · ')}
            {project.voiceEnabled ? ' · voiceover on' : ' · captions only'}
            {project.consentFilter ? ' · consent filter on' : ' · consent filter off'}
          </p>
        </div>
        <ProduceButton projectId={project.id} hasFilms={renders.length > 0} />
      </header>

      {blocked.length > 0 && (
        <div className="rounded-md border border-red-600/30 bg-red-600/10 p-4 font-caption text-sm text-red-900">
          <strong>{blocked.length} cut{blocked.length === 1 ? '' : 's'} cannot be rendered.</strong>{' '}
          The errors are listed on each card below — an uncleared asset, a shot that is too short to
          read, or a cut that misses its target length.
        </div>
      )}

      {renders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Films</h2>
          {renders.map((render) => (
            <RenderCard key={render.id} render={render} />
          ))}
        </section>
      )}

      <section className="rounded-lg border border-indigo/15 bg-white/40 p-5">
        <h2 className="font-display text-lg font-semibold">Script</h2>
        <p className="mt-2 whitespace-pre-wrap font-caption text-sm leading-relaxed text-indigo/75">
          {project.script}
        </p>
      </section>

      {views.length === 0 ? (
        <div className="rounded-lg border border-dashed border-indigo/20 p-10 text-center">
          <p className="font-display text-lg">No cuts planned yet</p>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            Planning sends the script and the catalogue to the model and returns one edit per length.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {views.map((view) => (
            <EdlViewer key={view.id} edl={view} />
          ))}
        </div>
      )}

      {project.jobs.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold">Recent jobs</h2>
          <ul className="mt-2 space-y-1 font-caption text-sm">
            {project.jobs.map((job) => (
              <li key={job.id} className="flex items-center gap-3">
                <Badge
                  variant={
                    job.status === 'succeeded' ? 'ok' : job.status === 'failed' ? 'error' : 'muted'
                  }
                >
                  {job.status}
                </Badge>
                <span className="truncate text-indigo/70">{job.error ?? job.message}</span>
                {job.costCents !== null && job.costCents > 0 && (
                  <span className="ml-auto shrink-0 text-xs text-indigo/40">
                    ${(job.costCents / 100).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
