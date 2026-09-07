# NAV ReelForge

Turn NeeRav Arts Village photo and video albums into scripted social videos: one
16:9 YouTube cut and three vertical cuts (30s / 60s / 90s), each planned as its
own edit rather than a truncation of the longest one.

Everything runs locally: SQLite for the catalogue, Redis for the job queues,
FFmpeg and Remotion for the media work.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 20.11+ (22 recommended) | `.nvmrc` pins 22 |
| pnpm | 10+ | `corepack enable && corepack prepare pnpm@10 --activate` |
| Docker | any recent | only used to run Redis (`pnpm redis:up`) |

FFmpeg is not required system-wide — the worker uses the bundled `ffmpeg-static`
(FFmpeg 7.x) and `@ffprobe-installer` binaries. Point `FFMPEG_PATH` / `FFPROBE_PATH` at a system
build if you prefer one (e.g. a hardware-accelerated ffmpeg).

## Quick start

```bash
pnpm install
pnpm setup     # writes .env, generates secrets, migrates and seeds the database
pnpm dev       # starts Redis (Docker), the web app and the worker
```

Then open http://localhost:3000. The Studio page shows whether the database and
queue are reachable, plus what has been built so far.

`pnpm setup` fills in `ENCRYPTION_KEY` and `SESSION_SECRET` for you. Add the
service keys yourself — `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, and the
Google OAuth client (see below). Every variable is documented in `.env.example`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Redis + web + worker, prefixed output, Ctrl-C stops both apps |
| `pnpm dev:web` / `pnpm dev:worker` | run one side on its own |
| `pnpm redis:up` / `pnpm redis:down` | Redis container lifecycle |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | Prisma workflow |
| `pnpm db:reset` | drop and rebuild the dev database |
| `pnpm test` | Vitest unit suite |
| `pnpm typecheck` | TypeScript across every workspace package |
| `pnpm fixtures` | regenerate the synthetic test album in `tests/fixtures/` |
| `pnpm sample` | render the hand-written sample EDL to `renders/sample/` |
| `pnpm studio` | open the Remotion studio on the compositions |
| `pnpm fonts:fetch` | re-download the brand faces into `packages/video/fonts` |

## Layout

```
apps/web        Next.js 14 App Router — UI and API routes; enqueues, never renders
apps/worker     BullMQ consumers — ingest, analyse, plan, tts, render
packages/shared Zod schemas, brand/format constants, EDL rules (no runtime deps)
packages/media  FFmpeg/sharp: probe, thumbnails, 720p proxies, colours, zip
packages/google OAuth (PKCE), Photos Picker sessions, Drive listing/download
packages/ai     Anthropic calls: vision descriptions, cost estimates, pricing
packages/video  Remotion compositions, brand kit, self-hosted fonts, renderer
packages/db     Prisma client, AES-256-GCM token encryption, path helpers
prisma/         schema.prisma, migrations, seed
media/          ingested originals — written once, never modified
renders/        outputs, one folder per job: mp4 + srt + vtt + thumbnail
assets/music/   your licensed music library (see the README in that folder)
```

Queues report progress by appending `JobEvent` rows; the web app streams those
over SSE, so progress survives a page reload or a worker restart.

## Ingest

Four sources, all landing in the same catalogue: **Upload**, **Google Photos**,
**Google Drive**, and (unsupported, flag-gated) **Share link**. Pick one on the
Library page; `/library?source=photos` deep-links to a tab.

### Upload

Drop files on the Library page — photos, videos, or a zip. The upload streams
straight to `tmp/uploads/<batchId>/` (busboy, not `request.formData()`, so a 2 GB
clip never sits in memory), then a worker job:

1. checksums each file (sha256) and skips anything already in the library, so
   re-uploading an album is safe;
2. probes it — dimensions, duration, fps, audio, capture time, EXIF. Video
   rotation flags are applied, so a phone clip recorded 1280×720 with a 90°
   display matrix is catalogued as 720×1280 portrait;
3. moves the original into `media/<assetId>/original.<ext>` and builds a
   thumbnail, a 720p H.264 proxy for video, and a dominant-colour palette;
4. reports progress the whole way, streamed to the browser over SSE.

Anything unreadable is skipped with a warning rather than failing the batch, and
a file that fails halfway is rolled back — no half-ingested rows in the grid.

### Google Photos

Connect an account in Settings, then **Open Google Photos picker**. ReelForge
creates a Picker session, opens Google's own picker in a new tab, and polls until
you have finished choosing; the selection is then downloaded at full resolution
(`=d` for photos, `=dv` for video — without those suffixes Google returns a
stripped, resized preview) and catalogued exactly like an upload.

This is the only supported way to read Google Photos: the Library API read scopes
were removed in March 2025, so no app can browse your albums. ReelForge sees what
you pick in the picker and nothing else.

### Google Drive

Paste a folder link (`/folders/…`, an `open?id=` link, or a bare id). Photos and
videos directly inside the folder are listed with the Drive API and downloaded
read-only. Shared drives work; the folder is not walked recursively.

### Share link (unsupported)

Behind `ENABLE_SHARE_LINK_SCRAPER=true`. Google publishes no API for public
`photos.app.goo.gl` links, so this reads the page's HTML and pulls media URLs out
of it. It will break whenever Google changes that page, and the UI says so. Use
the picker.

### Consent and failures

Consent defaults to *not cleared*. Tick the box before ingesting if the batch is
already cleared, or toggle assets individually in the grid. Nothing uncleared can
reach a render.

An item that cannot be downloaded or read is skipped with a warning; the rest of
the batch still lands. Re-ingesting the same media is a no-op — files are deduped
by sha256, so pulling the same album twice costs nothing but the download.

## Describing the library

**Describe with AI** on the Library page runs one vision call per asset and
records a one-line description, tags from a fixed vocabulary, a people count, a
focal point, and whether the Indian flag is visible. Photos are sent as a single
downscaled frame; videos as three frames sampled across the clip, because one
poster frame cannot tell a slow pan from a dance.

Nothing runs until you have seen what it will cost. The estimate is computed
from the actual pixel dimensions of what would be sent — a wall of 4K stills
costs several times what a wall of phone snaps does — and it is deliberately a
ceiling: prompt caching across the batch usually beats it. A run that would
exceed `AI_MAX_BATCH_COST_USD` (default $5) is refused rather than started.

The model is `ANTHROPIC_VISION_MODEL` (default `claude-opus-5`). Pointing it at
`claude-sonnet-5` or `claude-haiku-4-5` costs less per asset, and the estimate
updates to match. `ANTHROPIC_VISION_EFFORT` defaults to `low`: describing one
image is a classification task, and higher effort mostly buys longer thinking you
are paying for. The response comes back through a strict tool schema and is
validated with Zod before anything is written, so a tag outside the vocabulary or
a focal point outside the frame is rejected rather than stored.

Two things are deliberate: the pass never sets consent (that is a human
decision), and it never overwrites a tag you set by hand — a re-run replaces only
its own tags. Assets flagged as containing the Indian flag get a badge in the
grid and are excluded from cropping and overlays downstream.

The actual cost of each run is recorded on the job, so the job history doubles as
a spend log.

## Planning the edit

A project is a script plus a set of output lengths. **Plan the edit** sends the
script and the catalogue to the planning model and gets back one edit per
length — one call per target, so the 30-second cut is a genuine re-edit rather
than the first 30 seconds of the 90. The script and catalogue are identical
across those calls, so everything after the first is served from the prompt
cache.

The model returns segment *lengths*, not timeline positions. A model doing
running arithmetic over twenty segments will eventually produce a gap or an
overlap, and there is no reason to let it try when the cumulative sum is exact
in code. The timeline, the trim out-points and the duration fitting are all
computed here:

- fixed-length cuts are retimed onto their target — segments scale
  proportionally, clamped to what each asset can support, with the remainder
  redistributed — and land exactly on 30, 60 or 90 seconds;
- the 16:9 cut runs to the length of the script, and is only clamped, so a
  four-second clip is never asked to play for four and a half.

Then `validateEdl` enforces what the prompt merely requested. Prompts are
requests; this is the gate:

| Rule | What happens |
| --- | --- |
| Uncleared asset | **Error** — the cut is marked blocked and cannot be rendered |
| Asset containing the Indian flag | Motion forced to `hold`, caption stripped, both reported |
| Photo given a trim, clip given a ken-burns | Corrected to the motion that makes sense |
| Shot under 1.2s, or a caption under 1.2s | **Error** |
| Trim running past the end of its clip | **Error** |
| Cut outside ±0.5s of its target | **Error** |

Corrections are warnings and the cut still renders; errors block it. Every plan
is stored either way — a blocked cut is easier to fix when you can see it — and
re-planning keeps the old version rather than overwriting it.

The project page shows each cut as a timeline strip and a segment table (in/out,
asset, motion, caption, voiceover), with the raw model JSON one click away.

## Rendering

Four compositions, one per format, all driven by the same `Film` component and
the same props shape:

```
pnpm sample                    # renders every format from a hand-written EDL
pnpm sample portrait_9x16_30   # just one
pnpm studio                    # interactive, with the sample EDL loaded
```

The output lands in `renders/sample/`. No project, API key or queue needed —
the sample EDL is committed, and it exercises every motion the renderer
implements.

**Title and end cards are overlaid, not appended.** Adding a 2-second title and
a 3-second end card either side of a 30-second cut would produce a 35-second
file and break the duration contract the planner was held to. Both sit on top of
the opening and closing shots instead, and captions and the logo bug stop when
the end card comes up rather than showing through it.

**Smart cropping.** A landscape still in a vertical frame is cropped around the
focal point the vision pass recorded, via `object-position` — never a blind
centre crop, which reliably frames a shoulder and cuts off the face.

**The flag rules are in the renderer too, not only the planner.** An asset marked
as containing the Indian flag is letterboxed whole onto the brand ground —
`contain`, not `cover`, so nothing is cropped away — held still with no
ken-burns move, and carries no caption and no logo bug. That last part is why
the logo is drawn as a sequence of gaps between flagged segments rather than one
persistent layer.

**Fonts are bundled, not fetched.** Fraunces, Marcellus and Poppins live in
`packages/video/fonts` as woff2 (67 KB total, all SIL Open Font License). A
renderer that reaches the network mid-frame fails on a bad connection and
silently falls back to a system font; the render also blocks until the faces are
actually loaded, so the first frames cannot be laid out in the wrong typeface.

**Chromium.** Remotion downloads its own Chrome Headless Shell on first use. To
use an existing browser, set `REMOTION_BROWSER_EXECUTABLE` — but it must be a
*headless shell* build, not a regular Chrome binary.

## Configuration notes

**Database.** SQLite in dev (`prisma/dev.db`). The schema avoids Prisma enums and
scalar lists so it applies unchanged to Postgres — switch the `datasource`
provider and point `DATABASE_URL` at a `postgresql://` URL.

**Google Cloud (needed from build step 3).** In the Google Cloud console:

1. Create a project, then **APIs & Services → Library** and enable the **Google
   Photos Picker API** and the **Google Drive API**.
2. **OAuth consent screen**: External, add yourself as a test user, and add the
   scopes `.../auth/photospicker.mediaitems.readonly` and `.../auth/drive.readonly`.
3. **Credentials → Create credentials → OAuth client ID → Web application**, with
   the authorised redirect URI set to exactly
   `http://localhost:3000/api/auth/google/callback`.
4. Copy the client ID and secret into `.env`.

ReelForge reads Google Photos through the **Picker API** only: you open the
picker, choose albums or items, and the app downloads what you selected. The
Library API read scopes were removed in March 2025, so there is no way to browse
your albums from the app itself.

**Music.** Tracks come from your own licensed library. Drop audio into
`assets/music/` and describe it in `assets/music/manifest.json`, then run
`pnpm db:seed`. Audio files are gitignored; the manifest (including the licence
note per track) is committed.

## Rules the pipeline enforces

- Only assets with `consentCleared = true` reach the planner or a render. The
  filter defaults on, and a render is blocked if an EDL references a cleared-off
  asset.
- Assets tagged as containing the Indian flag are never overlaid, cropped or
  ken-burnsed.
- Originals in `media/` are never modified; outputs go to `renders/<jobId>/`.
- Each EDL must land within ±0.5s of its target duration, and no caption may be
  on screen for less than 1.2s.

## Build progress

1. ✅ Monorepo, Prisma schema, `.env.example`, `pnpm dev` orchestration
2. ✅ Direct-upload ingest → probe → catalogue
3. ✅ Google Photos Picker + Drive folder ingest
4. ✅ AI descriptions and tags, with a cost estimate before running
5. ✅ Script → EDL planning with Zod validation
6. ✅ Remotion compositions for 16:9 and 9:16
7. ⬜ ElevenLabs voiceover, word alignment, SRT/VTT, music ducking
8. ⬜ End-to-end pipeline: progress, preview, per-segment regenerate, download
9. ⬜ Tests: EDL validation, duration fitting, fixture-album end-to-end
10. ⬜ Full README and troubleshooting

## Troubleshooting

**`pnpm dev` says Redis could not start.** Docker isn't running, or port 6379 is
taken. Check with `docker ps` and `redis-cli ping`. If you run Redis some other
way, set `REDIS_URL` (and `REDIS_PORT`) in `.env` — `pnpm dev` reuses an
already-listening instance instead of starting a container.

**"You must provide a nonempty URL" from Prisma.** `.env` is missing or
unreadable. Run `pnpm setup`. The `.env` lives at the monorepo root; the web app,
the worker and the dev script all load it from there.

**"Queue name cannot contain :".** BullMQ reserves the colon. Queue names live in
`packages/shared/src/schemas/job.ts` and use hyphens.

**Prisma client not found / stale types.** Run `pnpm db:generate`. The client is
generated into `packages/db/generated/client`, which is gitignored, so it needs
generating after a fresh clone (`pnpm setup` does it).

**Ignored build scripts on install.** pnpm 10 blocks postinstall scripts by
default; the allowed list is `pnpm.onlyBuiltDependencies` in the root
`package.json`. If you add a package with a native build step, add it there.

**Google says `redirect_uri_mismatch`.** The OAuth client's authorised redirect
URI must match `GOOGLE_REDIRECT_URI` exactly, including the port and the trailing
path — `http://localhost:3000/api/auth/google/callback`. The Settings page shows
the value the app will send.

**"State mismatch" after consenting.** The handshake finished in a different
browser (or the cookies were cleared). Start again from Settings; the PKCE
verifier and state live in HttpOnly cookies for ten minutes.

**Google returns 403 on the picker.** Enable the **Photos Picker API** for the
project, and check the consent screen actually granted
`photospicker.mediaitems.readonly` — a scope added after the first consent needs
a reconnect.

**Downloads come back small or without EXIF.** Something dropped the `=d` / `=dv`
suffix on the Picker `baseUrl`; that is what asks Google for the original bytes.

**Rendering fails with "Old Headless mode has been removed".**
`REMOTION_BROWSER_EXECUTABLE` is pointing at a full Chrome binary. Point it at a
`chrome-headless-shell` build instead, or unset it and let Remotion download its
own.

**A setting in `.env` seems to be ignored.** A real environment variable wins:
`.env` is loaded without overriding what is already exported in your shell (or
set by a container). `env | grep ANTHROPIC` will show a shadowing value.

**The AI batch is refused as too expensive.** `AI_MAX_BATCH_COST_USD` caps a
single run. Narrow the scope to "not yet described", switch
`ANTHROPIC_VISION_MODEL` to a cheaper model, or raise the limit.

**A HEIC photo was skipped.** sharp's prebuilt libvips has no HEIC support, and
the FFmpeg fallback cannot always decode it either. Export as JPEG, or point
`FFMPEG_PATH` at a system FFmpeg built with libheif.

**Uploads fail immediately with a size error.** `MAX_UPLOAD_MB` (default 2048)
is per file, enforced while streaming.

**Port 3000 is busy.** Set `WEB_PORT` in `.env`, and update `APP_URL` plus the
Google redirect URI to match.
