import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DATABASE_URL ??= 'file:./dev.db'
process.env.ANTHROPIC_VISION_MODEL = 'claude-opus-5'
process.env.ANTHROPIC_VISION_EFFORT = 'low'

const create = vi.fn()

// Stubbing the client keeps the request shape under test without spending money.
vi.mock('../../packages/ai/src/client.js', () => ({
  anthropic: () => ({ messages: { create } }),
  visionModel: () => 'claude-opus-5',
  planningModel: () => 'claude-opus-5',
  isAiConfigured: () => true,
}))

const { describeAsset } = await import('../../packages/ai/src/describeAsset.js')

const image = { base64: 'ZmFrZQ==', mediaType: 'image/jpeg', width: 1024, height: 576 }

const validEntry = {
  description: 'Three dancers mid-turn on the open-air stage under warm evening light.',
  tags: ['stage', 'night', 'wide'],
  peopleCount: 3,
  focalPoint: { x: 0.5, y: 0.42 },
  containsIndianFlag: false,
}

function toolResponse(input: unknown, stopReason = 'tool_use') {
  return {
    stop_reason: stopReason,
    content: [{ type: 'tool_use', name: 'record_asset', input }],
    usage: { input_tokens: 1200, output_tokens: 90, cache_read_input_tokens: 400 },
  }
}

beforeEach(() => create.mockReset())
afterEach(() => vi.clearAllMocks())

describe('describeAsset', () => {
  it('sends the frames and forces the catalogue tool', async () => {
    create.mockResolvedValue(toolResponse(validEntry))

    await describeAsset({
      kind: 'video',
      originalName: 'bonfire.mp4',
      durationSec: 12.5,
      capturedAt: new Date('2026-01-14T18:30:00Z'),
      images: [image, image, image],
    })

    const request = create.mock.calls[0][0]
    expect(request.model).toBe('claude-opus-5')
    expect(request.output_config.effort).toBe('low')
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'record_asset' })
    // strict:true is what guarantees the arguments match the schema.
    expect(request.tools[0].strict).toBe(true)
    expect(request.tools[0].input_schema.additionalProperties).toBe(false)

    const content = request.messages[0].content
    expect(content.filter((b: { type: string }) => b.type === 'image')).toHaveLength(3)
    // The trailing text tells the model what it is looking at.
    const text = content.at(-1).text
    expect(text).toContain('12.5-second')
    expect(text).toContain('bonfire.mp4')
    expect(text).toContain('2026-01-14')
  })

  it('sends one image for a photo and says so', async () => {
    create.mockResolvedValue(toolResponse(validEntry))
    await describeAsset({
      kind: 'photo',
      originalName: 'lake.jpg',
      durationSec: null,
      capturedAt: null,
      images: [image],
    })

    const content = create.mock.calls[0][0].messages[0].content
    expect(content.filter((b: { type: string }) => b.type === 'image')).toHaveLength(1)
    expect(content.at(-1).text).toContain('A photograph')
  })

  it('returns the validated entry and the tokens it used', async () => {
    create.mockResolvedValue(toolResponse(validEntry))
    const result = await describeAsset({
      kind: 'photo',
      originalName: 'a.jpg',
      durationSec: null,
      capturedAt: null,
      images: [image],
    })

    expect(result.analysis).toEqual(validEntry)
    // Cached reads still cost something, so they count towards the job total.
    expect(result.inputTokens).toBe(1600)
    expect(result.outputTokens).toBe(90)
  })

  it('rejects a tag outside the vocabulary rather than writing it', async () => {
    create.mockResolvedValue(toolResponse({ ...validEntry, tags: ['stage', 'fireworks'] }))
    await expect(
      describeAsset({
        kind: 'photo',
        originalName: 'a.jpg',
        durationSec: null,
        capturedAt: null,
        images: [image],
      }),
    ).rejects.toThrow()
  })

  it('rejects a focal point outside the frame', async () => {
    create.mockResolvedValue(toolResponse({ ...validEntry, focalPoint: { x: 1.4, y: 0.5 } }))
    await expect(
      describeAsset({
        kind: 'photo',
        originalName: 'a.jpg',
        durationSec: null,
        capturedAt: null,
        images: [image],
      }),
    ).rejects.toThrow()
  })

  it('surfaces a refusal as an error instead of a silent skip', async () => {
    create.mockResolvedValue({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber' },
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    await expect(
      describeAsset({
        kind: 'photo',
        originalName: 'a.jpg',
        durationSec: null,
        capturedAt: null,
        images: [image],
      }),
    ).rejects.toThrow(/declined/)
  })

  it('refuses to call the API with no frames', async () => {
    await expect(
      describeAsset({
        kind: 'video',
        originalName: 'broken.mp4',
        durationSec: 3,
        capturedAt: null,
        images: [],
      }),
    ).rejects.toThrow(/No frames/)
    expect(create).not.toHaveBeenCalled()
  })
})
