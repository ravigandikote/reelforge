import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import { ensureDir } from './paths.js'
import { isSupportedMedia } from './mime.js'

export interface ExtractedEntry {
  /** Path on disk of the extracted file. */
  filePath: string
  /** Name as it appeared inside the archive. */
  entryName: string
}

/**
 * Extracts the supported media out of a zip, flattened into `destDir`.
 * Directory entries, junk (`__MACOSX`, dotfiles) and unsupported types are
 * skipped, and entry names are sanitised so an archive cannot write outside
 * the destination.
 */
export function extractZip(zipPath: string, destDir: string): Promise<ExtractedEntry[]> {
  return new Promise((resolve, reject) => {
    const extracted: ExtractedEntry[] = []

    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('Could not open archive'))

      zip.on('entry', (entry: yauzl.Entry) => {
        const entryName = entry.fileName
        const base = path.basename(entryName)

        const skip =
          entryName.endsWith('/') ||
          entryName.includes('__MACOSX') ||
          base.startsWith('.') ||
          !isSupportedMedia(base)

        if (skip) return zip.readEntry()

        zip.openReadStream(entry, async (streamErr, readStream) => {
          if (streamErr || !readStream) return reject(streamErr ?? new Error('Unreadable entry'))
          try {
            await ensureDir(destDir)
            const filePath = await uniquePath(destDir, base, extracted)
            await pipeline(readStream, createWriteStream(filePath))
            extracted.push({ filePath, entryName })
            zip.readEntry()
          } catch (writeErr) {
            reject(writeErr)
          }
        })
      })

      zip.on('end', () => resolve(extracted))
      zip.on('error', reject)
      zip.readEntry()
    })
  })
}

/** Two folders in one archive can hold the same filename; keep both. */
async function uniquePath(dir: string, base: string, taken: ExtractedEntry[]): Promise<string> {
  const ext = path.extname(base)
  const stem = path.basename(base, ext)
  let candidate = path.join(dir, base)
  let n = 1
  while (taken.some((e) => e.filePath === candidate)) {
    candidate = path.join(dir, `${stem}-${n++}${ext}`)
  }
  return candidate
}
