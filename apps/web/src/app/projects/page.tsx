import Link from 'next/link'
import { fromJson, prisma } from '@reelforge/db'
import { RENDER_FORMATS, type RenderTarget } from '@reelforge/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: { edls: { select: { id: true, target: true } } },
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Projects</h1>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            A script and the cuts planned from it.
          </p>
        </div>
        <Link href="/projects/new">
          <Button variant="accent">New project</Button>
        </Link>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-indigo/20 p-10 text-center">
          <p className="font-display text-lg">No projects yet</p>
          <p className="mt-1 font-caption text-sm text-indigo/60">
            Write a script and ReelForge will plan a cut for each output length.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => {
            const targets = fromJson<RenderTarget[]>(project.targetsJson, [])
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo/15 bg-white/50 px-5 py-4 transition-colors hover:border-terracotta/40"
                >
                  <span className="font-display text-lg">{project.title}</span>
                  <span className="font-caption text-xs text-indigo/50">
                    {targets.map((target) => RENDER_FORMATS[target]?.label ?? target).join(' · ')}
                  </span>
                  <span className="ml-auto">
                    <Badge variant={project.edls.length > 0 ? 'ok' : 'muted'}>
                      {project.edls.length > 0 ? `${project.edls.length} plans` : 'not planned'}
                    </Badge>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
