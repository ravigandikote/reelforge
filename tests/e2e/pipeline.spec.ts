import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anthropicStub, elevenLabsStub, type Stub } from './stubs.js'

const run = promisify(execFile)
const repo = path.resolve(__dirname, '../..')
const fixtures = path.join(repo, 'tests/fixtures/album')

/**
 * The whole pipeline over the fixture album, with local stand-ins for the two
 * APIs: upload, catalogue, describe, plan, narrate, render. Everything between
 * those stand-ins is the real code — the same job functions the worker runs.
 *
 * Rendering needs a headless browser. When one cannot be found the render
 * assertions are skipped rather than failing the suite, and the message says so.
 */
const browser = process.env.REMOTION_BROWSER_EXECUTABLE
const canRender = Boolean(browser && existsSync(browser))

let workDir: string
let anthropic: Stub
let eleven: Stub
let prisma: typeof import('@reelforge/db').prisma
let jobs: {
  runIngest: typeof import('../../apps/worker/src/jobs/ingest.js').runIngest
  runAnalyze: typeof import('../../apps/worker/src/jobs/analyze.js').runAnalyze
  runPlan: typeof import('../../apps/worker/src/jobs/plan.js').runPlan
  runTts: typeof import('../../apps/worker/src/jobs/tts.js').runTts
  runRender: typeof import('../../apps/worker/src/jobs/render.js').runRender
}

const state: {
  projectId: string
  edlId: string
  jobIds: Record<string, string>
} = { projectId: '', edlId: '', jobIds: {} }

async function newJob(type: string, projectId?: string): Promise<string> {
  const job = await prisma.job.create({
    data: { type, projectId: projectId ?? null, status: 'queued', message: 'queued by the test' },
  })
  state.jobIds[type] = job.id
  return job.id
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'reelforge-e2e-'))

  anthropic = await anthropicStub()
  eleven = await elevenLabsStub()

  // Everything the pipeline touches is redirected into the temp directory, so a
  // run cannot disturb the developer's own library or database.
  process.env.DATABASE_URL = `file:${path.join(workDir, 'e2e.db')}`
  process.env.MEDIA_DIR = path.join(workDir, 'media')
  process.env.RENDERS_DIR = path.join(workDir, 'renders')
  process.env.ANTHROPIC_API_KEY = 'stub'
  process.env.ANTHROPIC_BASE_URL = anthropic.url
  process.env.ANTHROPIC_VISION_MODEL = 'claude-opus-5'
  process.env.ANTHROPIC_PLANNING_MODEL = 'claude-opus-5'
  process.env.ELEVENLABS_API_KEY = 'stub'
  process.env.ELEVENLABS_BASE_URL = eleven.url
  process.env.ELEVENLABS_VOICE_ID = 'stub-voice'

  await run('pnpm', ['exec', 'prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: repo,
    env: process.env,
  })

  // Imported after the environment is set: the Prisma client reads the URL when
  // it is constructed.
  prisma = (await import('@reelforge/db')).prisma
  jobs = {
    runIngest: (await import('../../apps/worker/src/jobs/ingest.js')).runIngest,
    runAnalyze: (await import('../../apps/worker/src/jobs/analyze.js')).runAnalyze,
    runPlan: (await import('../../apps/worker/src/jobs/plan.js')).runPlan,
    runTts: (await import('../../apps/worker/src/jobs/tts.js')).runTts,
    runRender: (await import('../../apps/worker/src/jobs/render.js')).runRender,
  }

  const { TAG_VOCABULARY, BRAND_COLORS, BRAND_FONTS } = await import('@reelforge/shared')
  for (const tag of TAG_VOCABULARY) {
    await prisma.tag.upsert({ where: { slug: tag.slug }, update: {}, create: tag })
  }
  await prisma.brandKit.create({
    data: {
      name: 'Test kit',
      isDefault: true,
      colorsJson: JSON.stringify(BRAND_COLORS),
      fontsJson: JSON.stringify(BRAND_FONTS),
    },
  })
}, 180_000)

afterAll(async () => {
  await prisma?.$disconnect()
  await anthropic?.close()
  await eleven?.close()
  await rm(workDir, { recursive: true, force: true })
})

describe('the fixture album, end to end', () => {
  it('ingests and catalogues every file', async () => {
    const batch = await prisma.ingestBatch.create({ data: { source: 'upload', status: 'pending' } })
    const jobId = await newJob('ingest')

    // Staged the way the upload route stages: one directory per file.
    const staging = path.join(repo, 'tmp/uploads', batch.id)
    const names = [
      'stage-wide.jpg',
      'lake-portrait.jpg',
      'bonfire-square.jpg',
      'performance-landscape.mp4',
      'phone-rotated.mp4',
    ]
    const items: string[] = []
    for (const [index, name] of names.entries()) {
      const dir = path.join(staging, String(index))
      await mkdir(dir, { recursive: true })
      await copyFile(path.join(fixtures, name), path.join(dir, name))
      items.push(path.join(dir, name))
    }

    await jobs.runIngest({
      jobId,
      batchId: batch.id,
      source: 'upload',
      items,
      remoteItems: [],
      accountId: null,
      externalRef: null,
      markCleared: true,
    })

    const assets = await prisma.asset.findMany({ orderBy: { createdAt: 'asc' } })
    expect(assets).toHaveLength(5)
    expect(assets.every((asset) => asset.consentCleared)).toBe(true)

    const byName = new Map(assets.map((asset) => [asset.originalName, asset]))
    expect(byName.get('stage-wide.jpg')?.orientation).toBe('landscape')
    expect(byName.get('lake-portrait.jpg')?.orientation).toBe('portrait')
    expect(byName.get('bonfire-square.jpg')?.orientation).toBe('square')
    // Stored 1280x720 with a rotation flag; catalogued as it displays.
    expect(byName.get('phone-rotated.mp4')?.orientation).toBe('portrait')
    expect(byName.get('performance-landscape.mp4')?.hasAudio).toBe(true)

    // Every asset has its derivatives, and videos also have a proxy.
    for (const asset of assets) {
      expect(asset.thumbPath).toBeTruthy()
      if (asset.kind === 'video') expect(asset.proxyPath).toBeTruthy()
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } })
    expect(job?.status).toBe('succeeded')
  }, 180_000)

  it('describes and tags them, and records what it cost', async () => {
    const assets = await prisma.asset.findMany({ orderBy: { createdAt: 'asc' } })
    const jobId = await newJob('analyze')

    await jobs.runAnalyze({ jobId, assetIds: assets.map((asset) => asset.id) })

    const described = await prisma.asset.findMany({
      include: { tags: { include: { tag: true } } },
      orderBy: { createdAt: 'asc' },
    })

    for (const asset of described) {
      expect(asset.description).toBeTruthy()
      expect(asset.analyzedAt).toBeTruthy()
      expect(asset.focalPointX).toBeGreaterThan(0)
      expect(asset.tags.length).toBeGreaterThan(0)
    }

    // The stub flags the fourth asset; the flag tag follows the boolean.
    const flagged = described.filter((asset) => asset.hasIndianFlag)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]!.tags.map((link) => link.tag.slug)).toContain('indian_flag')

    const job = await prisma.job.findUnique({ where: { id: jobId } })
    expect(job?.status).toBe('succeeded')
    expect(job?.costCents).toBeGreaterThan(0)
  }, 120_000)

  it('plans a 30-second cut that lands on 30 seconds', async () => {
    const project = await prisma.project.create({
      data: {
        title: 'End to end',
        script:
          'NeeRav Arts Village sits on ten acres of farm and lake near Bengaluru. Artists come here to make work in the open. Come and spend a weekend with us.',
        targetsJson: JSON.stringify(['portrait_9x16_30']),
        voiceEnabled: true,
        consentFilter: true,
      },
    })
    state.projectId = project.id

    const jobId = await newJob('plan', project.id)
    await jobs.runPlan({ jobId, projectId: project.id, targets: ['portrait_9x16_30'] })

    const edl = await prisma.edl.findFirst({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
      include: { segments: { orderBy: { index: 'asc' } } },
    })
    expect(edl).toBeTruthy()
    state.edlId = edl!.id

    // The contract: within half a second of the target.
    expect(Math.abs(edl!.actualSeconds - 30)).toBeLessThanOrEqual(0.5)
    expect(edl!.segments.length).toBeGreaterThan(1)

    // The timeline is continuous.
    for (let i = 1; i < edl!.segments.length; i++) {
      expect(edl!.segments[i]!.startSec).toBeCloseTo(edl!.segments[i - 1]!.endSec, 3)
    }

    const stored = JSON.parse(edl!.rawJson) as { ok: boolean; issues: Array<{ code: string }> }
    expect(stored.ok).toBe(true)

    // The stub asked for a ken-burns move on the flagged asset; it was corrected.
    const flaggedAsset = await prisma.asset.findFirst({ where: { hasIndianFlag: true } })
    const flaggedSegments = edl!.segments.filter((s) => s.assetId === flaggedAsset!.id)
    expect(flaggedSegments.length).toBeGreaterThan(0)
    for (const segment of flaggedSegments) {
      expect(segment.motion).toBe('hold')
      expect(segment.captionText).toBeNull()
    }
    expect(stored.issues.map((issue) => issue.code)).toContain('flag_motion_removed')
  }, 120_000)

  it('narrates it, aligns the words and writes subtitles', async () => {
    const jobId = await newJob('tts', state.projectId)
    await jobs.runTts({ jobId, edlId: state.edlId })

    const edl = await prisma.edl.findUnique({
      where: { id: state.edlId },
      include: { segments: { include: { words: true } } },
    })

    expect(edl?.voicePath).toBeTruthy()
    expect(edl?.srtPath).toBeTruthy()
    expect(edl?.vttPath).toBeTruthy()

    const words = edl!.segments.flatMap((segment) => segment.words)
    expect(words.length).toBeGreaterThan(10)
    // Word timings are absolute on the film's timeline, not per segment.
    expect(Math.max(...words.map((word) => word.endSec))).toBeGreaterThan(5)

    const srt = await readFile(path.join(process.env.RENDERS_DIR!, state.edlId, 'captions.srt'), 'utf8')
    expect(srt).toMatch(/^1\n00:00:\d\d,\d\d\d --> 00:00:\d\d,\d\d\d\n/)

    const vtt = await readFile(path.join(process.env.RENDERS_DIR!, state.edlId, 'captions.vtt'), 'utf8')
    expect(vtt.startsWith('WEBVTT')).toBe(true)
  }, 300_000)

  it('blocks the render when an asset loses its consent', async () => {
    const asset = await prisma.asset.findFirst({ where: { hasIndianFlag: false } })
    await prisma.asset.update({ where: { id: asset!.id }, data: { consentCleared: false } })

    const jobId = await newJob('render-blocked', state.projectId)
    await expect(
      jobs.runRender({ jobId, edlId: state.edlId, target: 'portrait_9x16_30' }),
    ).rejects.toThrow(/consent/i)

    const job = await prisma.job.findUnique({ where: { id: jobId } })
    expect(job?.status).toBe('failed')

    // Put it back for the render below.
    await prisma.asset.update({ where: { id: asset!.id }, data: { consentCleared: true } })
  }, 120_000)

  it.runIf(canRender)(
    'renders a playable film with picture and sound',
    async () => {
      const jobId = await newJob('render', state.projectId)
      await jobs.runRender({ jobId, edlId: state.edlId, target: 'portrait_9x16_30' })

      const render = await prisma.render.findFirst({ where: { edlId: state.edlId } })
      expect(render).toBeTruthy()
      expect(render!.width).toBe(1080)
      expect(render!.height).toBe(1920)
      expect(render!.bytes).toBeGreaterThan(100_000)

      const { probeFile } = await import('@reelforge/media')
      const videoPath = path.join(process.env.RENDERS_DIR!, jobId, 'portrait_9x16_30.mp4')
      const probed = await probeFile(videoPath)

      expect(probed.width).toBe(1080)
      expect(probed.height).toBe(1920)
      expect(probed.durationSec).toBeCloseTo(30, 0)
      // The narration made it into the file.
      expect(probed.hasAudio).toBe(true)

      expect(existsSync(path.join(process.env.RENDERS_DIR!, jobId, 'portrait_9x16_30.jpg'))).toBe(true)
    },
    900_000,
  )

  it('kept the two API stand-ins honest', () => {
    // Vision: one call per asset. Planning: one per target.
    const visionCalls = anthropic.calls.filter(
      (call) => (call.tools as Array<{ name: string }>)?.[0]?.name === 'record_asset',
    )
    const planCalls = anthropic.calls.filter(
      (call) => (call.tools as Array<{ name: string }>)?.[0]?.name === 'submit_edit',
    )

    expect(visionCalls).toHaveLength(5)
    expect(planCalls).toHaveLength(1)
    // Every request forced its tool, which is what keeps the response parseable.
    for (const call of [...visionCalls, ...planCalls]) {
      expect((call.tool_choice as { type: string }).type).toBe('tool')
      expect((call.tools as Array<{ strict: boolean }>)[0]!.strict).toBe(true)
    }
    expect(eleven.calls.length).toBeGreaterThan(0)
  })
})
