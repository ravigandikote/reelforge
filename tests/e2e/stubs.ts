import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { ffmpegPath } from '@reelforge/media'

const run = promisify(execFile)

export interface Stub {
  url: string
  /** What the stub was asked for, so a test can assert on the request shape. */
  calls: Array<Record<string, unknown>>
  close: () => Promise<void>
}

function listen(handler: (body: string, url: string) => Promise<unknown>): Promise<Stub> {
  const calls: Array<Record<string, unknown>> = []

  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      handler(body, req.url ?? '')
        .then((payload) => {
          calls.push(body ? (JSON.parse(body) as Record<string, unknown>) : {})
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(payload))
        })
        .catch((err: Error) => {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        })
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        calls,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}

/**
 * Stands in for the Messages API. It answers the two tools the pipeline uses,
 * reading the catalogue out of the prompt so the ids it returns are real ones —
 * which is what makes the validator's checks meaningful in the test.
 */
export function anthropicStub(): Promise<Stub> {
  let described = 0

  return listen(async (body) => {
    const request = JSON.parse(body || '{}') as {
      model?: string
      tools?: Array<{ name: string }>
      system?: Array<{ text?: string }>
      messages?: Array<{ content: unknown }>
    }

    const tool = request.tools?.[0]?.name
    const system = (request.system ?? []).map((block) => block.text ?? '').join('\n')

    let input: unknown
    if (tool === 'submit_edit') {
      const catalogue = [...system.matchAll(/^- ([a-z0-9]{20,}) \| (photo|clip ([\d.]+)s)[^\n]*$/gm)].map(
        (match) => ({
          id: match[1]!,
          kind: match[2]!.startsWith('clip') ? ('video' as const) : ('photo' as const),
          flagged: match[0]!.includes('| FLAG |'),
        }),
      )

      const user = String((request.messages?.[0]?.content as string) ?? '')
      const targetSeconds = Number(user.match(/land at about (\d+) seconds/)?.[1] ?? 0)
      const count = targetSeconds ? Math.max(4, Math.round(targetSeconds / 5)) : 6

      input = {
        titleText: targetSeconds ? null : 'NeeRav Arts Village',
        segments: Array.from({ length: count }, (_, index) => {
          const asset = catalogue[index % catalogue.length]!
          return {
            assetId: asset.id,
            // Deliberately off target: the fitter is what lands it.
            durationSec: 4.5,
            motion: asset.flagged
              ? 'ken_burns_in' // must be corrected to a hold
              : asset.kind === 'video'
                ? 'trim'
                : index % 2
                  ? 'ken_burns_in'
                  : 'pan_left',
            trimStartSec: asset.kind === 'video' ? 0 : null,
            captionText: index % 2 === 0 ? `Caption for shot ${index + 1}` : null,
            voiceoverText: `Narration for shot ${index + 1}, spoken over the picture.`,
          }
        }),
      }
    } else if (tool === 'replace_segment') {
      const user = String((request.messages?.[0]?.content as string) ?? '')
      const ids = [...user.matchAll(/^- ([a-z0-9]{20,}) \|/gm)].map((match) => match[1]!)
      const current = user.match(/The shot being replaced: ([a-z0-9]{20,}),/)?.[1]
      const pick = ids.find((id) => id !== current) ?? ids[0]
      input = {
        assetId: pick,
        motion: 'pan_right',
        trimStartSec: null,
        captionText: 'A wider view',
        voiceoverText: 'A wider view of the grounds.',
        reason: 'Wider, as asked.',
      }
    } else {
      // The vision pass. One asset is flagged so the exclusions get exercised.
      described += 1
      input = {
        description: `Test description ${described}`,
        tags: described % 2 ? ['stage', 'night', 'wide'] : ['lake', 'day', 'close_up'],
        peopleCount: described,
        focalPoint: { x: 0.45, y: 0.4 },
        containsIndianFlag: described === 4,
      }
    }

    return {
      id: `msg_stub_${described}`,
      type: 'message',
      role: 'assistant',
      model: request.model,
      content: [{ type: 'tool_use', id: 'toolu_stub', name: tool, input }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1200, output_tokens: 220, cache_read_input_tokens: 0 },
    }
  })
}

/** Stands in for ElevenLabs, returning real audio and matching character timings. */
export function elevenLabsStub(): Promise<Stub> {
  const CHARS_PER_SECOND = 14

  return listen(async (body, url) => {
    if (url.includes('/voices')) {
      return { voices: [{ voice_id: 'stub-voice', name: 'Stub', labels: { accent: 'indian' } }] }
    }

    const { text = '' } = JSON.parse(body || '{}') as { text?: string }
    const duration = Math.max(0.6, text.length / CHARS_PER_SECOND)
    const file = path.join(tmpdir(), `reelforge-stub-${Date.now()}-${Math.random()}.mp3`)

    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `sine=frequency=180:duration=${duration.toFixed(3)}`,
      '-af', 'tremolo=f=5.5:d=0.8,volume=0.5',
      '-c:a', 'libmp3lame', '-b:a', '96k', file,
    ])

    const audio = await readFile(file)
    await unlink(file).catch(() => {})

    const characters = [...text]
    const per = duration / Math.max(characters.length, 1)
    return {
      audio_base64: audio.toString('base64'),
      alignment: null,
      normalized_alignment: {
        characters,
        character_start_times_seconds: characters.map((_, i) => Number((i * per).toFixed(4))),
        character_end_times_seconds: characters.map((_, i) => Number(((i + 1) * per).toFixed(4))),
      },
    }
  })
}
