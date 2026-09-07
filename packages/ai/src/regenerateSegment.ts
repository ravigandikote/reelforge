import type Anthropic from '@anthropic-ai/sdk'
import {
  MAX_SEGMENT_SEC,
  MIN_SEGMENT_SEC,
  RENDER_FORMATS,
  type CatalogueEntry,
  type PlannedSegment,
  type RenderTarget,
} from '@reelforge/shared'
import { getEnv } from '@reelforge/shared/env'
import { anthropic, planningModel } from './client.js'

export interface RegenerateInput {
  target: RenderTarget
  script: string
  /** The segment being replaced, plus the shots either side for continuity. */
  current: PlannedSegment
  previous: PlannedSegment | null
  next: PlannedSegment | null
  /** Fixed: the replacement has to occupy the same slot in the timeline. */
  durationSec: number
  catalogue: CatalogueEntry[]
  voiceEnabled: boolean
  /** What the editor did not like, in their words. Optional. */
  note: string | null
}

export interface RegenerateResult {
  segment: PlannedSegment
  inputTokens: number
  outputTokens: number
  model: string
}

const TOOL: Anthropic.Tool = {
  name: 'replace_segment',
  description: 'Return the replacement for this one segment.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      assetId: { type: 'string', description: 'An id from the catalogue.' },
      motion: {
        type: 'string',
        enum: ['ken_burns_in', 'ken_burns_out', 'pan_left', 'pan_right', 'hold', 'trim'],
      },
      trimStartSec: { type: ['number', 'null'] },
      captionText: { type: ['string', 'null'] },
      voiceoverText: { type: ['string', 'null'] },
      reason: { type: 'string', description: 'One line on why this is better.' },
    },
    required: ['assetId', 'motion', 'trimStartSec', 'captionText', 'voiceoverText', 'reason'],
    additionalProperties: false,
  },
}

function describe(segment: PlannedSegment | null, label: string): string {
  if (!segment) return `${label}: none.`
  return `${label}: ${segment.assetId}, ${segment.motion}, ${segment.durationSec}s${
    segment.captionText ? `, caption "${segment.captionText}"` : ''
  }.`
}

/**
 * Re-plans a single segment while everything around it stays put. The duration
 * is fixed, so the film's length — and every other segment's timing — is
 * unchanged: this is a swap, not a re-edit.
 */
export async function regenerateSegment(input: RegenerateInput): Promise<RegenerateResult> {
  const model = planningModel()
  const format = RENDER_FORMATS[input.target]

  const catalogue = input.catalogue
    .map((asset) =>
      `- ${asset.id} | ${asset.kind === 'video' ? `clip ${asset.durationSec?.toFixed(1) ?? '?'}s` : 'photo'} | ${asset.orientation}${asset.hasIndianFlag ? ' | FLAG' : ''} | ${asset.description ?? 'no description'}`,
    )
    .join('\n')

  const response = await anthropic().messages.create({
    model,
    max_tokens: 2000,
    output_config: { effort: getEnv().ANTHROPIC_PLANNING_EFFORT },
    system: [
      {
        type: 'text',
        text: `You are re-cutting one shot in a finished edit for NeeRav Arts Village, a ten-acre arts venue near Bengaluru.

Everything except this one segment stays as it is. Keep it working with the shots either side: do not repeat the asset immediately before or after it, and keep the narration continuous with the script.

Rules:
- Only use an assetId from the catalogue.
- The segment is exactly ${input.durationSec} seconds. You cannot change that; choose an asset and a treatment that suit the length (${MIN_SEGMENT_SEC}-${MAX_SEGMENT_SEC}s is the range the edit works in).
- Photographs take ken_burns_in, ken_burns_out, pan_left, pan_right or hold. Clips take trim with an in-point, or hold.
- A clip cannot play past the end of its footage.
- Assets marked FLAG contain the Indian national flag: motion "hold" only, and never a caption.
- ${input.voiceEnabled ? 'voiceoverText carries this beat of the script.' : 'There is no voiceover; voiceoverText must be null.'}`,
      },
    ],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'replace_segment' },
    messages: [
      {
        role: 'user',
        content: `${format.label}.

SCRIPT:
${input.script}

${describe(input.previous, 'The shot before')}
${describe(input.current, 'The shot being replaced')}
${describe(input.next, 'The shot after')}

${input.note ? `The editor's note: ${input.note}` : 'The editor asked for a different take on this shot.'}

CATALOGUE:
${catalogue}`,
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to re-plan this segment')
  }

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!call) throw new Error('The model returned no replacement')

  const raw = call.input as {
    assetId: string
    motion: PlannedSegment['motion']
    trimStartSec: number | null
    captionText: string | null
    voiceoverText: string | null
  }

  return {
    segment: {
      assetId: String(raw.assetId),
      // The slot's length is not the model's to change.
      durationSec: input.durationSec,
      motion: raw.motion,
      trimStartSec: raw.trimStartSec === null ? null : Number(raw.trimStartSec),
      captionText: raw.captionText?.trim() || null,
      voiceoverText: raw.voiceoverText?.trim() || null,
    },
    inputTokens: response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    model,
  }
}
