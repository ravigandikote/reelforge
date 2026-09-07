import type Anthropic from '@anthropic-ai/sdk'
import { AI_TAG_SLUGS, assetAnalysisSchema, type AssetAnalysis } from '@reelforge/shared'
import { getEnv } from '@reelforge/shared/env'
import { anthropic, visionModel } from './client.js'

export interface VisionInput {
  base64: string
  mediaType: string
  width: number
  height: number
}

export interface DescribeInput {
  kind: 'photo' | 'video'
  originalName: string
  durationSec: number | null
  capturedAt: Date | null
  images: VisionInput[]
}

export interface DescribeResult {
  analysis: AssetAnalysis
  inputTokens: number
  outputTokens: number
  model: string
}

const SYSTEM = `You catalogue media for NeeRav Arts Village, a ten-acre arts and cultural venue near Bengaluru that hosts performances, retreats and residencies on grounds with a lake, a working farm, an open-air stage and bonfire areas.

You are looking at one asset at a time. Record it for an editor who will later search this catalogue to build a short film, so be concrete about what is actually visible: who is in shot, what they are doing, where, and in what light.

Rules:
- The description is one sentence, under 160 characters, plain and specific. No marketing language, no "captivating" or "vibrant", no invented names.
- Choose only tags that clearly apply. Fewer accurate tags beat many vague ones.
- focalPoint is where a viewer's eye goes — a performer's face, the centre of the action — as fractions of the frame from the top-left. It is used to crop landscape footage to vertical, so getting it wrong crops the subject out.
- containsIndianFlag must be true if the Indian national flag appears anywhere in the frame, even small or partly visible. Those assets are excluded from cropping and overlays, so a false negative matters more than a false positive.`

const TOOL: Anthropic.Tool = {
  name: 'record_asset',
  description: 'Record the catalogue entry for the asset shown.',
  // strict:true guarantees the arguments validate against this schema, so the
  // Zod parse below is a second belt rather than the only one.
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'One concrete sentence describing what is visible, under 160 characters.',
      },
      tags: {
        type: 'array',
        items: { type: 'string', enum: AI_TAG_SLUGS },
        description: 'Tags that clearly apply. Omit anything uncertain.',
      },
      peopleCount: {
        type: 'integer',
        description: 'How many people are visible. Estimate for a crowd; 0 if none.',
      },
      focalPoint: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '0 = left edge, 1 = right edge' },
          y: { type: 'number', description: '0 = top edge, 1 = bottom edge' },
        },
        required: ['x', 'y'],
        additionalProperties: false,
      },
      containsIndianFlag: {
        type: 'boolean',
        description: 'True if the Indian national flag is visible anywhere in the frame.',
      },
    },
    required: ['description', 'tags', 'peopleCount', 'focalPoint', 'containsIndianFlag'],
    additionalProperties: false,
  },
}

function contextLine(input: DescribeInput): string {
  const parts = [
    input.kind === 'video'
      ? `A ${input.durationSec ? `${input.durationSec.toFixed(1)}-second ` : ''}video clip, sampled as ${input.images.length} frame${input.images.length === 1 ? '' : 's'} in order.`
      : 'A photograph.',
    `Filename: ${input.originalName}.`,
    input.capturedAt ? `Taken ${input.capturedAt.toISOString().slice(0, 10)}.` : null,
  ]
  return parts.filter(Boolean).join(' ')
}

/** One vision call per asset, returning validated fields and what it cost. */
export async function describeAsset(input: DescribeInput): Promise<DescribeResult> {
  if (input.images.length === 0) throw new Error('No frames could be read from this asset')

  const model = visionModel()
  const content: Anthropic.ContentBlockParam[] = input.images.map((image) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType as 'image/jpeg',
      data: image.base64,
    },
  }))
  content.push({ type: 'text', text: contextLine(input) })

  const response = await anthropic().messages.create({
    model,
    max_tokens: 1024,
    // The system prompt and tool schema are identical for every asset in a run,
    // so the prefix is worth caching across the batch.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: getEnv().ANTHROPIC_VISION_EFFORT },
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'record_asset' },
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(
      `The model declined to describe this asset (${response.stop_details?.category ?? 'unspecified'})`,
    )
  }

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!call) throw new Error('The model returned no catalogue entry')

  const analysis = assetAnalysisSchema.parse(call.input)

  return {
    analysis,
    inputTokens:
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    model,
  }
}
