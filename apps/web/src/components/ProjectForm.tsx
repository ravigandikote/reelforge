'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RENDER_FORMATS, RENDER_TARGETS, type RenderTarget } from '@reelforge/shared'
import { Button } from '@/components/ui/button'

const SAMPLE = `NeeRav Arts Village sits on ten acres of farm and lake near Bengaluru.

Every season, artists come here to make work in the open: dancers on the stage at dusk, musicians around the bonfire, weavers under the trees.

Come and spend a weekend with us.`

export function ProjectForm({ clearedAssets }: { clearedAssets: number }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [script, setScript] = useState('')
  const [targets, setTargets] = useState<RenderTarget[]>([...RENDER_TARGETS])
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [consentFilter, setConsentFilter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, script, targets, voiceEnabled, consentFilter }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Could not create the project')
      router.push(`/projects/${body.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="font-caption text-sm text-indigo/70" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Monsoon season teaser"
          className="mt-1 w-full rounded-md border border-indigo/20 bg-white/70 px-3 py-2 font-caption text-sm outline-none focus:border-terracotta"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="font-caption text-sm text-indigo/70" htmlFor="script">
            Script
          </label>
          <button
            type="button"
            onClick={() => setScript(SAMPLE)}
            className="font-caption text-xs text-terracotta hover:underline"
          >
            use a sample
          </button>
        </div>
        <textarea
          id="script"
          value={script}
          onChange={(event) => setScript(event.target.value)}
          rows={10}
          placeholder="What is this film about? Write it as you would say it aloud."
          className="mt-1 w-full rounded-md border border-indigo/20 bg-white/70 px-3 py-2 font-caption text-sm leading-relaxed outline-none focus:border-terracotta"
        />
        <p className="mt-1 font-caption text-xs text-indigo/50">
          {script.trim() ? `${script.trim().split(/\s+/).length} words · about ${Math.round(script.trim().split(/\s+/).length / 2.6)}s read aloud` : 'The planner follows this arc when choosing shots.'}
        </p>
      </div>

      <div>
        <p className="font-caption text-sm text-indigo/70">Outputs</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {RENDER_TARGETS.map((target) => {
            const format = RENDER_FORMATS[target]
            const checked = targets.includes(target)
            return (
              <label
                key={target}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors ${
                  checked ? 'border-terracotta/50 bg-terracotta/5' : 'border-indigo/15 bg-white/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setTargets((previous) =>
                      event.target.checked
                        ? [...previous, target]
                        : previous.filter((value) => value !== target),
                    )
                  }
                  className="mt-0.5 h-4 w-4 accent-[#BE5F3A]"
                />
                <span>
                  <span className="block font-caption text-sm">{format.label}</span>
                  <span className="block font-caption text-xs text-indigo/50">
                    {format.width}×{format.height} ·{' '}
                    {format.targetSeconds ? `${format.targetSeconds}s` : 'script length'}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        <p className="mt-2 font-caption text-xs text-indigo/50">
          Each length is planned as its own edit, not a trim of the longest one.
        </p>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 font-caption text-sm text-indigo/70">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(event) => setVoiceEnabled(event.target.checked)}
            className="h-4 w-4 accent-[#BE5F3A]"
          />
          Voiceover — narrate the script and time captions to the speech
        </label>
        <label className="flex items-center gap-2 font-caption text-sm text-indigo/70">
          <input
            type="checkbox"
            checked={consentFilter}
            onChange={(event) => setConsentFilter(event.target.checked)}
            className="h-4 w-4 accent-[#BE5F3A]"
          />
          Only use consent-cleared assets ({clearedAssets} available)
        </label>
        {!consentFilter && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 font-caption text-xs text-amber-900">
            With this off, uncleared assets can be planned into the edit. They are still flagged
            before a render.
          </p>
        )}
      </div>

      {error && <p className="font-caption text-sm text-red-800">{error}</p>}

      <Button
        variant="accent"
        disabled={busy || title.trim().length === 0 || script.trim().length < 20 || targets.length === 0}
        onClick={() => void submit()}
      >
        {busy ? 'Creating…' : 'Create project'}
      </Button>
    </div>
  )
}
