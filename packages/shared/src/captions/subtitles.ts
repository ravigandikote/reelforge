import type { CaptionCue } from './types.js'

function pad(value: number, size = 2): string {
  return String(Math.floor(value)).padStart(size, '0')
}

/** SRT uses a comma before the milliseconds; WebVTT uses a full stop. */
function timestamp(seconds: number, separator: ',' | '.'): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(millis, 3)}`
}

export function toSrt(cues: CaptionCue[]): string {
  return (
    cues
      .map((cue, index) =>
        [
          index + 1,
          `${timestamp(cue.startSec, ',')} --> ${timestamp(cue.endSec, ',')}`,
          cue.text,
        ].join('\n'),
      )
      // SRT wants a blank line between blocks and a trailing newline at the end.
      .join('\n\n') + (cues.length > 0 ? '\n' : '')
  )
}

export function toVtt(cues: CaptionCue[]): string {
  const blocks = cues.map((cue, index) =>
    [
      String(index + 1),
      `${timestamp(cue.startSec, '.')} --> ${timestamp(cue.endSec, '.')}`,
      cue.text,
    ].join('\n'),
  )
  return `WEBVTT\n\n${blocks.join('\n\n')}${blocks.length > 0 ? '\n' : ''}`
}
