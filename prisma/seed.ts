import { readFile } from 'node:fs/promises'
import path from 'node:path'
import 'dotenv/config'
import { prisma } from '@reelforge/db'
import {
  BRAND_COLORS,
  BRAND_FONTS,
  BRAND_HANDLE,
  BRAND_WEBSITE,
  TAG_VOCABULARY,
} from '@reelforge/shared'

const root = path.resolve(process.cwd())

async function seedTags() {
  for (const tag of TAG_VOCABULARY) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { label: tag.label, group: tag.group },
      create: tag,
    })
  }
  console.log(`✓ ${TAG_VOCABULARY.length} tags`)
}

async function seedBrandKit() {
  await prisma.brandKit.upsert({
    where: { name: 'NeeRav Arts Village' },
    update: {},
    create: {
      name: 'NeeRav Arts Village',
      isDefault: true,
      colorsJson: JSON.stringify(BRAND_COLORS),
      fontsJson: JSON.stringify(BRAND_FONTS),
      logoPath: 'assets/logo_light.png',
      logoMarkPath: 'assets/logo_mark.png',
      handle: BRAND_HANDLE,
      website: BRAND_WEBSITE,
    },
  })
  console.log('✓ brand kit')
}

/** Music comes from your own licensed files; manifest.json is the source of truth. */
async function seedMusic() {
  const manifestPath = path.join(root, process.env.MUSIC_DIR ?? './assets/music', 'manifest.json')
  let entries: Array<{
    title: string
    file: string
    durationSec: number
    bpm?: number
    mood?: string
    license?: string
  }> = []

  try {
    entries = JSON.parse(await readFile(manifestPath, 'utf8')).tracks ?? []
  } catch {
    console.log('· no music manifest yet — skipping (see assets/music/README.md)')
    return
  }

  for (const track of entries) {
    const trackPath = path.posix.join('assets/music', track.file)
    await prisma.musicTrack.upsert({
      where: { path: trackPath },
      update: {
        title: track.title,
        durationSec: track.durationSec,
        bpm: track.bpm ?? null,
        mood: track.mood ?? null,
        license: track.license ?? null,
      },
      create: {
        title: track.title,
        path: trackPath,
        durationSec: track.durationSec,
        bpm: track.bpm ?? null,
        mood: track.mood ?? null,
        license: track.license ?? null,
      },
    })
  }
  console.log(`✓ ${entries.length} music tracks`)
}

async function main() {
  await seedTags()
  await seedBrandKit()
  await seedMusic()
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
