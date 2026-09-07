'use client'

import { formatBytes } from '@/lib/format'

export interface RenderView {
  id: string
  target: string
  label: string
  width: number
  height: number
  durationSec: number
  bytes: number | null
  createdAt: string
  hasCaptions: boolean
}

/** The finished film: a player, the numbers, and everything to download. */
export function RenderCard({ render }: { render: RenderView }) {
  const vertical = render.height > render.width

  return (
    <div className="flex flex-wrap items-start gap-4 rounded-lg border border-indigo/15 bg-white/50 p-4">
      <video
        controls
        preload="metadata"
        poster={`/api/renders/${render.id}/thumb`}
        className={`rounded-md bg-indigo ${vertical ? 'w-40' : 'w-72'}`}
      >
        <source src={`/api/renders/${render.id}/video`} type="video/mp4" />
        {render.hasCaptions && (
          <track
            kind="captions"
            srcLang="en"
            label="English"
            src={`/api/renders/${render.id}/vtt`}
            default
          />
        )}
      </video>

      <div className="min-w-[12rem] flex-1 space-y-2">
        <p className="font-display text-lg font-semibold">{render.label}</p>
        <p className="font-caption text-xs text-indigo/60">
          {render.width}×{render.height} · {render.durationSec.toFixed(1)}s
          {render.bytes ? ` · ${formatBytes(render.bytes)}` : ''}
        </p>
        <div className="flex flex-wrap gap-3 font-caption text-xs">
          <a
            href={`/api/renders/${render.id}/video?download`}
            className="text-terracotta hover:underline"
          >
            download mp4
          </a>
          {render.hasCaptions && (
            <>
              <a href={`/api/renders/${render.id}/srt`} className="text-terracotta hover:underline">
                .srt
              </a>
              <a href={`/api/renders/${render.id}/vtt`} className="text-terracotta hover:underline">
                .vtt
              </a>
            </>
          )}
          <a
            href={`/api/renders/${render.id}/thumb?download`}
            className="text-terracotta hover:underline"
          >
            thumbnail
          </a>
        </div>
      </div>
    </div>
  )
}
