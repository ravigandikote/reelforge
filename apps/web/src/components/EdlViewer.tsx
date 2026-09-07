'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { VoiceButton } from '@/components/VoiceButton'

export interface EdlIssueView {
  level: string
  code: string
  message: string
  segment?: number
}

export interface EdlSegmentView {
  index: number
  startSec: number
  endSec: number
  assetId: string
  assetName: string
  assetKind: string
  motion: string
  trimStartSec: number | null
  captionText: string | null
  voiceoverText: string | null
  hasIndianFlag: boolean
}

export interface EdlView {
  id: string
  hasVoice: boolean
  hasCaptions: boolean
  target: string
  label: string
  version: number
  targetSeconds: number
  actualSeconds: number
  ok: boolean
  model: string | null
  createdAt: string
  issues: EdlIssueView[]
  segments: EdlSegmentView[]
  raw: unknown
}

const MOTION_LABEL: Record<string, string> = {
  ken_burns_in: 'push in',
  ken_burns_out: 'pull out',
  pan_left: 'pan left',
  pan_right: 'pan right',
  hold: 'hold',
  trim: 'play',
}

/** Deterministic colour per asset so the timeline shows repeats at a glance. */
function tint(assetId: string): string {
  let hash = 0
  for (let i = 0; i < assetId.length; i++) hash = (hash * 31 + assetId.charCodeAt(i)) % 360
  return `hsl(${hash} 45% 62%)`
}

export function EdlViewer({ edl }: { edl: EdlView }) {
  const [showJson, setShowJson] = useState(false)
  const errors = edl.issues.filter((issue) => issue.level === 'error')
  const warnings = edl.issues.filter((issue) => issue.level !== 'error')

  return (
    <div className="rounded-lg border border-indigo/15 bg-white/50">
      <div className="flex flex-wrap items-center gap-3 border-b border-indigo/10 px-5 py-3">
        <h3 className="font-display text-lg font-semibold">{edl.label}</h3>
        <Badge variant={edl.ok ? 'ok' : 'error'}>{edl.ok ? 'ready' : 'blocked'}</Badge>
        <span className="font-caption text-xs text-indigo/60">
          {edl.segments.length} segments · {edl.actualSeconds.toFixed(1)}s
          {edl.targetSeconds ? ` of ${edl.targetSeconds}s` : ''} · v{edl.version}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {edl.hasCaptions && (
            <>
              <a
                href={`/api/edls/${edl.id}/captions?format=srt`}
                className="font-caption text-xs text-terracotta hover:underline"
              >
                .srt
              </a>
              <a
                href={`/api/edls/${edl.id}/captions?format=vtt`}
                className="font-caption text-xs text-terracotta hover:underline"
              >
                .vtt
              </a>
            </>
          )}
          <VoiceButton edlId={edl.id} hasVoice={edl.hasVoice} />
          <button
            type="button"
            onClick={() => setShowJson((value) => !value)}
            className="font-caption text-xs text-terracotta hover:underline"
          >
            {showJson ? 'show segments' : 'show JSON'}
          </button>
        </span>
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 border-b border-red-600/20 bg-red-600/5 px-5 py-3 font-caption text-xs text-red-900">
          {errors.map((issue, index) => (
            <li key={index}>
              <strong>{issue.code}</strong> · {issue.message}
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 border-b border-amber-500/20 bg-amber-500/5 px-5 py-3 font-caption text-xs text-amber-900">
          {warnings.map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      )}

      {showJson ? (
        <pre className="max-h-[28rem] overflow-auto px-5 py-4 font-mono text-[11px] leading-relaxed text-indigo/80">
          {JSON.stringify(edl.raw, null, 2)}
        </pre>
      ) : (
        <>
          <div className="flex h-6 w-full overflow-hidden px-5 pt-4">
            {edl.segments.map((segment) => (
              <div
                key={segment.index}
                title={`${segment.assetName} · ${(segment.endSec - segment.startSec).toFixed(1)}s`}
                style={{
                  width: `${((segment.endSec - segment.startSec) / Math.max(edl.actualSeconds, 0.001)) * 100}%`,
                  backgroundColor: tint(segment.assetId),
                }}
                className="h-full border-r border-white/60 first:rounded-l last:rounded-r last:border-r-0"
              />
            ))}
          </div>

          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full min-w-[42rem] border-collapse font-caption text-xs">
              <thead>
                <tr className="text-left text-indigo/50">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">In / out</th>
                  <th className="pb-2 pr-3 font-medium">Asset</th>
                  <th className="pb-2 pr-3 font-medium">Motion</th>
                  <th className="pb-2 pr-3 font-medium">Caption</th>
                  <th className="pb-2 font-medium">Voiceover</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {edl.segments.map((segment) => (
                  <tr key={segment.index} className="border-t border-indigo/8">
                    <td className="py-2 pr-3 tabular-nums text-indigo/40">{segment.index + 1}</td>
                    <td className="py-2 pr-3 tabular-nums text-indigo/60">
                      {segment.startSec.toFixed(1)}–{segment.endSec.toFixed(1)}
                      <span className="block text-[10px] text-indigo/40">
                        {(segment.endSec - segment.startSec).toFixed(1)}s
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tint(segment.assetId) }}
                        />
                        <span className="max-w-[12rem] truncate" title={segment.assetName}>
                          {segment.assetName}
                        </span>
                        {segment.hasIndianFlag && (
                          <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-900">
                            flag
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-indigo/70">
                      {MOTION_LABEL[segment.motion] ?? segment.motion}
                      {segment.trimStartSec !== null && (
                        <span className="block text-[10px] text-indigo/40">
                          from {segment.trimStartSec.toFixed(1)}s
                        </span>
                      )}
                    </td>
                    <td className="max-w-[12rem] py-2 pr-3 text-indigo/70">
                      {segment.captionText ?? <span className="text-indigo/25">—</span>}
                    </td>
                    <td className="max-w-[16rem] py-2 text-indigo/60">
                      {segment.voiceoverText ?? <span className="text-indigo/25">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
