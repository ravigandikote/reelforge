import Link from 'next/link'
import { prisma } from '@reelforge/db'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { redisReachable } from '@/lib/queue'

export const dynamic = 'force-dynamic'

/** Build order from the project brief; flipped to done as each step lands. */
const BUILD_STEPS: { step: number; label: string; done: boolean }[] = [
  { step: 1, label: 'Monorepo, Prisma schema, dev orchestration', done: true },
  { step: 2, label: 'Direct-upload ingest → probe → catalogue', done: true },
  { step: 3, label: 'Google Photos Picker + Drive ingest', done: true },
  { step: 4, label: 'AI descriptions and tags', done: true },
  { step: 5, label: 'Script → EDL planning', done: false },
  { step: 6, label: 'Remotion compositions', done: false },
  { step: 7, label: 'TTS, word alignment, SRT, music ducking', done: false },
  { step: 8, label: 'End-to-end pipeline with preview and download', done: false },
  { step: 9, label: 'Tests', done: false },
  { step: 10, label: 'README and troubleshooting', done: false },
]

async function recentJobs() {
  try {
    return await prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 5 })
  } catch {
    return []
  }
}

async function counts() {
  try {
    const [assets, cleared, projects, jobs, tracks] = await Promise.all([
      prisma.asset.count(),
      prisma.asset.count({ where: { consentCleared: true } }),
      prisma.project.count(),
      prisma.job.count(),
      prisma.musicTrack.count(),
    ])
    return { ok: true as const, assets, cleared, projects, jobs, tracks }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}

const JOB_TONE: Record<string, 'ok' | 'warn' | 'error' | 'muted'> = {
  succeeded: 'ok',
  running: 'warn',
  queued: 'muted',
  failed: 'error',
  cancelled: 'muted',
}

export default async function HomePage() {
  const [stats, redis, jobs] = await Promise.all([counts(), redisReachable(), recentJobs()])

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-3xl font-semibold">Studio</h1>
        <p className="mt-1 font-caption text-sm text-indigo/60">
          Ingest an album, write a script, get a 16:9 cut and three vertical cuts.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>Everything runs locally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-caption text-sm">
            <div className="flex items-center justify-between">
              <span>Database (SQLite)</span>
              <Badge variant={stats.ok ? 'ok' : 'error'}>{stats.ok ? 'connected' : 'unreachable'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Queue (Redis)</span>
              <Badge variant={redis ? 'ok' : 'error'}>{redis ? 'connected' : 'unreachable'}</Badge>
            </div>
            {!stats.ok && (
              <p className="pt-2 text-xs text-red-800">
                {stats.error} — run <code className="font-mono">pnpm setup</code>.
              </p>
            )}
            {!redis && (
              <p className="pt-2 text-xs text-red-800">
                Start Redis with <code className="font-mono">pnpm redis:up</code>.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Library</CardTitle>
            <CardDescription>Only consent-cleared assets can enter a render.</CardDescription>
          </CardHeader>
          <CardContent className="font-caption text-sm">
            {stats.ok ? (
              <dl className="grid grid-cols-2 gap-y-2">
                <dt className="text-indigo/60">Assets</dt>
                <dd className="text-right tabular-nums">{stats.assets}</dd>
                <dt className="text-indigo/60">Consent cleared</dt>
                <dd className="text-right tabular-nums">{stats.cleared}</dd>
                <dt className="text-indigo/60">Projects</dt>
                <dd className="text-right tabular-nums">{stats.projects}</dd>
                <dt className="text-indigo/60">Jobs</dt>
                <dd className="text-right tabular-nums">{stats.jobs}</dd>
                <dt className="text-indigo/60">Music tracks</dt>
                <dd className="text-right tabular-nums">{stats.tracks}</dd>
              </dl>
            ) : (
              <p className="text-indigo/60">No database yet.</p>
            )}
            <Link
              href="/library"
              className="mt-3 inline-block font-caption text-xs text-terracotta hover:underline"
            >
              Open the library →
            </Link>
          </CardContent>
        </Card>
      </div>

      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
            <CardDescription>Every ingest, plan and render keeps its own event log.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 font-caption text-sm">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center gap-3">
                  <Badge variant={JOB_TONE[job.status] ?? 'muted'}>{job.status}</Badge>
                  <span className="text-indigo/60">{job.type}</span>
                  <span className="truncate text-indigo/80">{job.error ?? job.message}</span>
                  <span className="ml-auto shrink-0 text-xs text-indigo/40">
                    {job.createdAt.toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Build progress</CardTitle>
          <CardDescription>Each step is demoed before the next one starts.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1.5 font-caption text-sm">
            {BUILD_STEPS.map((s) => (
              <li key={s.step} className="flex items-center gap-3">
                <Badge variant={s.done ? 'ok' : 'muted'}>{s.done ? 'done' : `step ${s.step}`}</Badge>
                <span className={s.done ? '' : 'text-indigo/60'}>{s.label}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
