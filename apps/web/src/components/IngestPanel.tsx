'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

type Tab = 'upload' | 'photos' | 'drive' | 'share'
type Phase = 'idle' | 'uploading' | 'waiting' | 'processing' | 'done' | 'error'

export interface IngestPanelProps {
  accept: string
  googleConfigured: boolean
  googleEmail: string | null
  shareLinkEnabled: boolean
  /** Deep link: /library?source=photos opens that tab directly. */
  initialTab?: Tab
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'photos', label: 'Google Photos' },
  { id: 'drive', label: 'Google Drive' },
  { id: 'share', label: 'Share link' },
]

export function IngestPanel({
  accept,
  googleConfigured,
  googleEmail,
  shareLinkEnabled,
  initialTab = 'upload',
}: IngestPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tab, setTab] = useState<Tab>(initialTab)
  const [phase, setPhase] = useState<Phase>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [markCleared, setMarkCleared] = useState(false)
  const [driveFolder, setDriveFolder] = useState('')
  const [shareUrl, setShareUrl] = useState('')

  const { update, log } = useJobStream(jobId, (status) => {
    setPhase(status === 'succeeded' ? 'done' : 'error')
    // The grid is a server component, so a refresh is what makes assets appear.
    router.refresh()
  })

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current) }, [])

  const busy = phase === 'uploading' || phase === 'waiting' || phase === 'processing'

  const startJob = useCallback((id: string, message?: string) => {
    setJobId(id)
    setPhase('processing')
    if (message) setNotice(message)
  }, [])

  const upload = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return

      const form = new FormData()
      // Sent before the files so busboy sees it while the uploads still stream.
      form.append('markCleared', String(markCleared))
      for (const file of list) form.append('files', file)

      const request = new XMLHttpRequest()
      request.open('POST', '/api/ingest/upload')
      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) setUploadPercent((event.loaded / event.total) * 100)
      })
      request.addEventListener('load', () => {
        try {
          const body = JSON.parse(request.responseText)
          if (request.status >= 400) throw new Error(body.error ?? 'Upload failed')
          startJob(body.jobId, body.skipped?.length ? `Skipped ${body.skipped.join(', ')}` : undefined)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed')
          setPhase('error')
        }
      })
      request.addEventListener('error', () => {
        setError('Upload failed — is the web app still running?')
        setPhase('error')
      })

      setError(null)
      setNotice(null)
      setUploadPercent(0)
      setPhase('uploading')
      request.send(form)
    },
    [markCleared, startJob],
  )

  /**
   * Picker flow: create a session, open Google's picker in a new tab, then poll
   * until the user has finished choosing. Google exposes nothing until then.
   */
  const startPicker = useCallback(async () => {
    setError(null)
    setNotice(null)
    setPhase('waiting')

    try {
      const response = await fetch('/api/picker/session', { method: 'POST' })
      const session = await response.json()
      if (!response.ok) throw new Error(session.error ?? 'Could not start a picker session')

      window.open(session.pickerUri, '_blank', 'noopener,noreferrer')
      setNotice('Choose your photos in the Google tab, then come back — this waits for you.')

      const poll = async () => {
        const url = `/api/picker/poll?sessionId=${encodeURIComponent(session.id)}&markCleared=${markCleared}`
        const result = await fetch(url).then((r) => r.json())

        if (result.error) {
          setError(result.error)
          setPhase('error')
          return
        }
        if (!result.ready) {
          pollTimer.current = setTimeout(() => void poll(), result.pollIntervalMs ?? 3000)
          return
        }
        startJob(result.jobId, `${result.count} item(s) selected`)
      }

      pollTimer.current = setTimeout(() => void poll(), session.pollIntervalMs ?? 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Picker failed')
      setPhase('error')
    }
  }, [markCleared, startJob])

  const submitJson = useCallback(
    async (endpoint: string, body: Record<string, unknown>) => {
      setError(null)
      setNotice(null)
      setPhase('waiting')
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, markCleared }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Request failed')
        startJob(result.jobId, `${result.count} item(s) queued`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed')
        setPhase('error')
      }
    },
    [markCleared, startJob],
  )

  const visibleTabs = TABS.filter((t) => t.id !== 'share' || shareLinkEnabled)

  return (
    <div className="rounded-lg border border-indigo/15 bg-white/40 p-5">
      <div className="mb-4 flex flex-wrap gap-1">
        {visibleTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-3 py-1 font-caption text-xs transition-colors ${
              tab === entry.id ? 'bg-indigo text-cream' : 'bg-indigo/8 text-indigo/70 hover:bg-indigo/15'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (!busy) upload(event.dataTransfer.files)
          }}
          className={`rounded-md border-2 border-dashed p-6 transition-colors ${
            dragging ? 'border-terracotta bg-terracotta/5' : 'border-indigo/20'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={(event) => {
              if (event.target.files) upload(event.target.files)
              event.target.value = ''
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-caption text-sm text-indigo/70">
              Drop photos, videos or a zip here. Originals are copied into the library and never
              modified.
            </p>
            <Button onClick={() => inputRef.current?.click()} disabled={busy} variant="accent">
              {busy ? 'Working…' : 'Choose files'}
            </Button>
          </div>
        </div>
      )}

      {tab === 'photos' && (
        <GoogleTab configured={googleConfigured} email={googleEmail}>
          <p className="font-caption text-sm text-indigo/70">
            Opens Google&apos;s own picker. Choose albums or individual items there — ReelForge
            downloads only what you select, at full resolution.
          </p>
          <Button onClick={() => void startPicker()} disabled={busy} variant="accent" className="mt-3">
            {phase === 'waiting' ? 'Waiting for your selection…' : 'Open Google Photos picker'}
          </Button>
        </GoogleTab>
      )}

      {tab === 'drive' && (
        <GoogleTab configured={googleConfigured} email={googleEmail}>
          <p className="font-caption text-sm text-indigo/70">
            Paste a Drive folder link. Photos and videos directly inside it are ingested; the
            connected account needs read access.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={driveFolder}
              onChange={(event) => setDriveFolder(event.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="min-w-[18rem] flex-1 rounded-md border border-indigo/20 bg-white/70 px-3 py-2 font-caption text-sm outline-none focus:border-terracotta"
            />
            <Button
              onClick={() => void submitJson('/api/ingest/drive', { folder: driveFolder })}
              disabled={busy || driveFolder.trim().length === 0}
              variant="accent"
            >
              Ingest folder
            </Button>
          </div>
        </GoogleTab>
      )}

      {tab === 'share' && shareLinkEnabled && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="font-caption text-sm font-medium text-amber-900">Unsupported</p>
          <p className="mt-1 font-caption text-sm text-amber-900/80">
            Google offers no API for public share links. This reads the page&apos;s HTML and will
            break whenever Google changes it — the picker is the reliable path.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={shareUrl}
              onChange={(event) => setShareUrl(event.target.value)}
              placeholder="https://photos.app.goo.gl/…"
              className="min-w-[18rem] flex-1 rounded-md border border-amber-600/30 bg-white/70 px-3 py-2 font-caption text-sm outline-none focus:border-amber-700"
            />
            <Button
              onClick={() => void submitJson('/api/ingest/sharelink', { url: shareUrl })}
              disabled={busy || shareUrl.trim().length === 0}
              variant="outline"
            >
              Try it
            </Button>
          </div>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 font-caption text-sm text-indigo/70">
        <input
          type="checkbox"
          checked={markCleared}
          onChange={(event) => setMarkCleared(event.target.checked)}
          className="h-4 w-4 accent-[#BE5F3A]"
        />
        Everyone in this batch has consented — mark as cleared for renders
      </label>

      {phase === 'uploading' && (
        <div className="mt-4 space-y-1">
          <ProgressBar value={uploadPercent} />
          <p className="font-caption text-xs text-indigo/60">
            Uploading… {Math.round(uploadPercent)}%
          </p>
        </div>
      )}

      {notice && <p className="mt-3 font-caption text-xs text-indigo/60">{notice}</p>}

      {update && (
        <div className="mt-4 space-y-1">
          <ProgressBar
            value={update.progress}
            tone={phase === 'error' || update.level === 'error' ? 'error' : 'accent'}
          />
          <p className="font-caption text-xs text-indigo/70">{update.message}</p>
          {log.some((entry) => entry.level === 'warn') && (
            <ul className="mt-2 space-y-0.5 font-caption text-xs text-amber-800">
              {log
                .filter((entry) => entry.level === 'warn')
                .slice(-5)
                .map((entry, index) => (
                  <li key={index}>· {entry.message}</li>
                ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-3 font-caption text-xs text-red-800">{error}</p>}
    </div>
  )
}

function GoogleTab({
  configured,
  email,
  children,
}: {
  configured: boolean
  email: string | null
  children: React.ReactNode
}) {
  if (!configured) {
    return (
      <div className="rounded-md border border-indigo/15 bg-white/50 p-4 font-caption text-sm text-indigo/70">
        Google is not configured yet. Add <code className="font-mono">GOOGLE_CLIENT_ID</code> and{' '}
        <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to <code className="font-mono">.env</code> —
        the README has the console steps.
      </div>
    )
  }

  if (!email) {
    return (
      <div className="rounded-md border border-indigo/15 bg-white/50 p-4">
        <p className="font-caption text-sm text-indigo/70">No Google account is connected yet.</p>
        <Link
          href="/settings"
          className="mt-2 inline-block font-caption text-sm text-terracotta hover:underline"
        >
          Connect one in Settings →
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-indigo/15 bg-white/50 p-4">
      <p className="font-caption text-xs uppercase tracking-wider text-indigo/40">
        Connected as {email}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  )
}
