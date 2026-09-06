'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ProgressBar, useJobStream } from '@/components/JobProgress'

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export function UploadPanel({ accept }: { accept: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [markCleared, setMarkCleared] = useState(false)

  const { update, log } = useJobStream(jobId, (status) => {
    setPhase(status === 'succeeded' ? 'done' : 'error')
    // The grid is a server component, so a refresh is what makes new assets appear.
    router.refresh()
  })

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
          setJobId(body.jobId)
          setPhase('processing')
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
      setUploadPercent(0)
      setPhase('uploading')
      request.send(form)
    },
    [markCleared],
  )

  const busy = phase === 'uploading' || phase === 'processing'

  return (
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
      className={`rounded-lg border-2 border-dashed p-6 transition-colors ${
        dragging ? 'border-terracotta bg-terracotta/5' : 'border-indigo/20 bg-white/40'
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
        <div>
          <p className="font-display text-lg font-semibold">Add media</p>
          <p className="font-caption text-sm text-indigo/60">
            Drop photos, videos or a zip here. Originals are copied into the library and never
            modified.
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={busy} variant="accent">
          {busy ? 'Working…' : 'Choose files'}
        </Button>
      </div>

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

      {(phase === 'processing' || phase === 'done' || phase === 'error') && update && (
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
