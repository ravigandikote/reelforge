import { prisma } from '@reelforge/db'
import { ProjectForm } from '@/components/ProjectForm'

export const dynamic = 'force-dynamic'

export default async function NewProjectPage() {
  const cleared = await prisma.asset.count({ where: { consentCleared: true, excluded: false } })

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">New project</h1>
        <p className="mt-1 font-caption text-sm text-indigo/60">
          The script drives the edit; the library supplies the shots.
        </p>
      </header>
      <ProjectForm clearedAssets={cleared} />
    </div>
  )
}
