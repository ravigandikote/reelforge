import type Anthropic from '@anthropic-ai/sdk'
import {
  MAX_SEGMENT_SEC,
  MIN_CAPTION_SEC,
  MIN_SEGMENT_SEC,
  RENDER_FORMATS,
  planResponseSchema,
  type CatalogueEntry,
  type PlannedSegment,
  type RenderTarget,
} from '@reelforge/shared'
import { getEnv } from '@reelforge/shared/env'
import { anthropic, planningModel } from './client.js'

export interface PlanInput {
  script: string
  target: RenderTarget
  catalogue: CatalogueEntry[]
  voiceEnabled: boolean
  projectTitle: string
}

export interface PlanResult {
  segments: PlannedSegment[]
  titleText: string | null
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  model: string
  raw: unknown
}

/** Roughly the pace of an unhurried Indian-English read, used to size segments. */
const WORDS_PER_SECOND = 2.6

const RULES = `You are the editor for NeeRav Arts Village, a ten-acre arts and cultural venue near Bengaluru. You cut short films from the venue's own photographs and footage.

You will be given a script and a catalogue of available assets, then asked for one specific cut. Return the edit as an ordered list of segments.

How to think about it:
- Follow the script's arc. Each segment should show what that part of the script is talking about; a shot of the lake under a line about music is a miss.
- Vary the shot lengths and the shot sizes. A run of identical 4-second wides is boring, and so is a run of close-ups.
- Open on something that earns attention and end on something that settles.
- Prefer footage where motion suits the moment: a clip for dancing, a still for a landscape.
- Use an asset more than once only if the catalogue is too small to avoid it, and never twice in a row.

Hard rules:
- Only use assetIds from the catalogue. Never invent one.
- durationSec is how long the segment is on screen, between ${MIN_SEGMENT_SEC} and ${MAX_SEGMENT_SEC} seconds. Give lengths, not timestamps — the timeline is assembled from your durations.
- Photographs take a motion of ken_burns_in, ken_burns_out, pan_left, pan_right or hold. Clips take trim, with trimStartSec as the in-point in the source footage, or hold for a freeze.
- A clip cannot play past the end of its own footage: trimStartSec plus durationSec must stay within its duration.
- captionText is a short on-screen phrase, at most about eight words, or null. Any segment carrying one must be at least ${MIN_CAPTION_SEC} seconds long.
- Assets marked "FLAG" contain the Indian national flag. Use them only with motion "hold" and never with a caption — nothing is moved across, cropped out of, or drawn over them.
- Every asset in the catalogue is cleared for use. Nothing outside it is.`

function catalogueText(catalogue: CatalogueEntry[]): string {
  const lines = catalogue.map((asset) => {
    const bits = [
      asset.id,
      asset.kind === 'video' ? `clip ${asset.durationSec?.toFixed(1) ?? '?'}s` : 'photo',
      asset.orientation,
      asset.tags.length ? asset.tags.join('/') : null,
      asset.peopleCount !== null ? `${asset.peopleCount}p` : null,
      asset.hasIndianFlag ? 'FLAG' : null,
      asset.description ?? 'no description',
    ]
    return `- ${bits.filter(Boolean).join(' | ')}`
  })
  return lines.join('\n')
}

function targetBrief(input: PlanInput): string {
  const format = RENDER_FORMATS[input.target]
  const seconds = format.targetSeconds

  const shape =
    format.width > format.height
      ? 'Landscape 16:9 for YouTube. Landscape assets sit naturally; portrait ones will be pillarboxed, so use them sparingly.'
      : 'Vertical 9:16 for Reels and Shorts. Landscape assets are cropped to the subject, so favour portrait assets for close work and use landscape where the crop still reads.'

  const length =
    seconds === null
      ? `Run as long as the script needs — read at about ${WORDS_PER_SECOND} words per second, this script is roughly ${Math.round(wordCount(input.script) / WORDS_PER_SECOND)} seconds of narration. Do not pad it out.`
      : `The cut must land at about ${seconds} seconds. This is its own edit, not the longer cut trimmed: choose the ${seconds >= 60 ? 'strongest sequence' : 'few strongest moments'} the script supports and let the rest go. Roughly ${Math.max(3, Math.round(seconds / 4))} to ${Math.round(seconds / 2)} segments suits this length.`

  const voice = input.voiceEnabled
    ? `voiceoverText carries the narration for each segment, drawn from the script — keep the wording close to the script, and size each segment to how long its line takes to say at about ${WORDS_PER_SECOND} words per second.`
    : 'There is no voiceover, so voiceoverText must be null everywhere. Carry the story in captionText instead, and give each caption room to be read.'

  return `${shape}\n\n${length}\n\n${voice}`
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const TOOL: Anthropic.Tool = {
  name: 'submit_edit',
  description: 'Submit the ordered segments for this cut.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      titleText: {
        type: ['string', 'null'],
        description: 'Title-card line, if this format opens with one. Short. Null otherwise.',
      },
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'An id from the catalogue.' },
            durationSec: {
              type: 'number',
              description: `Seconds on screen, ${MIN_SEGMENT_SEC}-${MAX_SEGMENT_SEC}.`,
            },
            motion: {
              type: 'string',
              enum: ['ken_burns_in', 'ken_burns_out', 'pan_left', 'pan_right', 'hold', 'trim'],
            },
            trimStartSec: {
              type: ['number', 'null'],
              description: 'In-point in the source clip, for motion "trim". Null for photographs.',
            },
            captionText: { type: ['string', 'null'] },
            voiceoverText: { type: ['string', 'null'] },
          },
          required: ['assetId', 'durationSec', 'motion', 'trimStartSec', 'captionText', 'voiceoverText'],
          additionalProperties: false,
        },
      },
    },
    required: ['titleText', 'segments'],
    additionalProperties: false,
  },
}

/**
 * Plans one cut. Called once per target so each duration is genuinely re-edited
 * rather than truncated — and because the script and catalogue are identical
 * across those calls, the prefix is cached and only the target brief is new.
 */
export async function planEdl(input: PlanInput): Promise<PlanResult> {
  const model = planningModel()

  const response = await anthropic().messages.create({
    model,
    max_tokens: 8000,
    output_config: { effort: getEnv().ANTHROPIC_PLANNING_EFFORT },
    system: [
      { type: 'text', text: RULES },
      {
        type: 'text',
        text: `PROJECT: ${input.projectTitle}\n\nSCRIPT:\n${input.script}\n\nCATALOGUE (${input.catalogue.length} assets):\n${catalogueText(input.catalogue)}`,
        // Identical for every target in this run, so it is worth caching.
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'submit_edit' },
    messages: [
      {
        role: 'user',
        content: `Plan the ${RENDER_FORMATS[input.target].label} cut.\n\n${targetBrief(input)}`,
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(
      `The model declined to plan this edit (${response.stop_details?.category ?? 'unspecified'})`,
    )
  }

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!call) throw new Error('The model returned no edit')

  // Zod re-checks what the strict tool schema already promised: a drifted
  // response fails the cut here rather than reaching the database.
  const parsed = planResponseSchema.safeParse(call.input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `The model returned an edit that does not match the schema: ${issue?.path.join('.')} ${issue?.message}`,
    )
  }

  const segments: PlannedSegment[] = parsed.data.segments.map((segment) => ({
    assetId: segment.assetId,
    durationSec: segment.durationSec,
    motion: segment.motion,
    trimStartSec: segment.trimStartSec,
    captionText: segment.captionText?.trim() || null,
    voiceoverText: segment.voiceoverText?.trim() || null,
  }))

  return {
    segments,
    titleText: parsed.data.titleText?.trim() || null,
    inputTokens:
      response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    cachedTokens: response.usage.cache_read_input_tokens ?? 0,
    model,
    raw: call.input,
  }
}
