# NAV ReelForge

Turn NeeRav Arts Village photo and video albums into scripted social videos: one
16:9 YouTube cut and three vertical cuts (30s / 60s / 90s), each planned as its
own edit rather than a truncation of the longest one.

Everything runs locally. SQLite holds the catalogue, Redis carries the job
queues, FFmpeg and Remotion do the media work, and the two paid services
(Anthropic for descriptions and edit planning, ElevenLabs for narration) are the
only things that leave the machine.

```
photos & clips ──▶ library ──▶ AI descriptions ──▶ script + catalogue ──▶ EDL per length
   upload            probe        tags, focal          planning model        ±0.5s of target
   Google Photos     thumbs       point, flag                                     │
   Google Drive      proxies                                                      ▼
                                                          narration ──▶ render ──▶ MP4 + SRT + thumb
                                                          word timings   Remotion
```

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node | 20.11+ (22 recommended) | `.nvmrc` pins 22 |
| pnpm | 10+ | `corepack enable && corepack prepare pnpm@10 --activate` |
| Docker | any recent | only used to run Redis; a local `redis-server` works just as well |

FFmpeg is not required system-wide — the worker uses the bundled `ffmpeg-static`
(FFmpeg 7.x) and `@ffprobe-installer` binaries. Point `FFMPEG_PATH` /
`FFPROBE_PATH` at a system build if you prefer one (a hardware-accelerated
FFmpeg, or one built with libheif for HEIC support).

Rendering needs a Chromium. Remotion downloads its own Chrome Headless Shell the
first time; `REMOTION_BROWSER_EXECUTABLE` overrides it.

## Quick start

```bash
pnpm install
pnpm bootstrap   # writes .env, generates secrets, migrates and seeds the database
pnpm dev         # Redis + web + worker
```

Open http://localhost:3000. The Studio page shows whether the database and queue
are reachable.

`pnpm bootstrap` fills in `ENCRYPTION_KEY` and `SESSION_SECRET`. Add the service
keys yourself — `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, and the Google OAuth
client (below). Every variable is documented in `.env.example`.

Nothing needs a key to start with: upload some photos, and `pnpm sample` renders
a film from a committed hand-written edit. Descriptions, planning and narration
are the parts that call out.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Redis + web + worker, prefixed output, Ctrl-C stops both apps |
| `pnpm dev:web` / `pnpm dev:worker` | run one side on its own |
| `pnpm bootstrap` | first-run setup; safe to re-run, never overwrites a secret |
| `pnpm redis:up` / `pnpm redis:down` | Redis container lifecycle |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | Prisma workflow |
| `pnpm db:reset` | drop and rebuild the dev database |
| `pnpm sample` | render the committed sample edit to `renders/sample/` |
| `pnpm sample --voice` | same, with a synthetic narration track and word-timed captions |
| `pnpm studio` | open the Remotion studio on the compositions |
| `pnpm test` | fast suite — schemas, EDL rules, media, captions, cost (seconds) |
| `pnpm test:e2e` | the whole pipeline over the fixture album (minutes) |
| `pnpm test:all` | both |
| `pnpm typecheck` | TypeScript across every workspace package |
| `pnpm fixtures` | regenerate the synthetic test album in `tests/fixtures/` |
| `pnpm fonts:fetch` | re-download the brand faces into `packages/video/fonts` |

`pnpm setup` is deliberately not a script here: that name belongs to pnpm's own
built-in command, which configures pnpm's home directory and would run instead.

## Layout

```
apps/web        Next.js 14 App Router — UI and API routes; enqueues, never renders
apps/worker     BullMQ consumers — ingest, analyse, plan, tts, render, pipeline
packages/shared Zod schemas, brand/format constants, EDL rules, caption timing
packages/db     Prisma client, AES-256-GCM token encryption, path helpers
packages/media  FFmpeg/sharp: probe, thumbnails, proxies, colours, zip, audio
packages/google OAuth (PKCE), Photos Picker sessions, Drive listing/download
packages/ai     Anthropic calls: vision descriptions, EDL planning, cost estimates
packages/tts    ElevenLabs narration with character-level timestamps
packages/video  Remotion compositions, brand kit, self-hosted fonts, renderer
prisma/         schema.prisma, migrations, seed
media/          ingested originals — written once, never modified
renders/        outputs: <edlId>/ for audio and subtitles, <jobId>/ for films
assets/music/   your licensed music library (see the README in that folder)
```

Long work happens in the worker; the web app only enqueues. Queues report
progress by appending `JobEvent` rows, which the web app streams over SSE — so
progress survives a page reload or a worker restart.

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

### Google Photos

Connect an account in Settings, then **Open Google Photos picker**. ReelForge
creates a Picker session, opens Google's own picker in a new tab, and polls until
you have finished choosing; the selection is then downloaded at full resolution
(`=d` for photos, `=dv` for video — without those suffixes Google returns a
stripped, resized preview) and catalogued exactly like an upload.

This is the only supported way to read Google Photos: the Library API read scopes
were removed in March 2025, so no app can browse your albums. ReelForge sees what
you pick and nothing else.

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

**Describe with AI** runs one vision call per asset and records a one-line
description, tags from a fixed vocabulary, a people count, a focal point, and
whether the Indian flag is visible. Photos go as a single downscaled frame;
videos as three frames sampled across the clip, because one poster frame cannot
tell a slow pan from a dance.

Nothing runs until you have seen what it will cost. The estimate is computed from
the actual pixel dimensions of what would be sent — a wall of 4K stills costs
several times what phone snaps do — and it is deliberately a ceiling. A run that
would exceed `AI_MAX_BATCH_COST_USD` (default $5) is refused rather than started.

`ANTHROPIC_VISION_MODEL` defaults to `claude-opus-5`; `claude-sonnet-5` or
`claude-haiku-4-5` cost less per asset and the estimate updates to match.
`ANTHROPIC_VISION_EFFORT` defaults to `low` — describing one image is a
classification task, and higher effort mostly buys thinking you pay for.

The response comes back through a strict tool schema and is validated with Zod
before anything is written, so a tag outside the vocabulary or a focal point
outside the frame is rejected rather than stored. The pass never sets consent —
that is a human decision — and never overwrites a tag you set by hand.

## Planning the edit

A project is a script plus a set of output lengths. Planning sends the script and
the catalogue to the planning model and gets back one edit per length — one call
per target, so the 30-second cut is a genuine re-edit rather than the first 30
seconds of the 90. The script and catalogue are identical across those calls, so
everything after the first is served from the prompt cache.

The model returns segment *lengths*, not timeline positions. A model doing
running arithmetic over twenty segments will eventually produce a gap or an
overlap, and there is no reason to let it try when the cumulative sum is exact in
code. The timeline, the trim out-points and the duration fitting are computed
here:

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

Corrections are warnings and the cut still renders; errors block it. Every plan is
stored either way — a blocked cut is easier to fix when you can see it — and
re-planning keeps the old version rather than overwriting it.

The project page shows each cut as a timeline strip and a segment table (in/out,
asset, motion, caption, voiceover), with the raw model JSON one click away.

## Voiceover and captions

Narrating a cut times its captions to the speech and mixes the music under it.
The artefacts belong to the cut, not to a render, so re-rendering the same edit
never pays for the narration twice:

```
renders/<edlId>/voice/000.mp3   one file per spoken segment
renders/<edlId>/voice.m4a       the lines placed on the film's timeline
renders/<edlId>/audio.m4a       the final mix, music ducked under the voice
renders/<edlId>/captions.srt    and .vtt
```

**Word timings come from the TTS provider, not a second alignment pass.**
ElevenLabs' `with-timestamps` endpoint returns character-level timings generated
with the audio, so they cannot drift from it the way a Whisper pass over the
finished file can — and it is one API call instead of two.

Lines are **placed at their segment's start, never concatenated.** The EDL decides
when each line is spoken; concatenating them would let one long line push
everything after it out of sync with the picture. A line that outruns its shot is
reported as a warning naming the segment, because that is the one problem the
edit cannot absorb by itself.

**Captions break where a reader expects.** Cues split on sentence endings, on a
pause in the delivery, at the word limit, and always at a cut. A cue too brief to
read is held longer rather than merged, and only merged backwards when there is
no room to hold it.

**Ducking is level-independent.** Both the narration and the bed are normalised
first — voice to -16 LUFS, music to -24 — and the voice then drives a sidechain
compressor on the bed. Without that, a hot track and a quiet one would duck by
wildly different amounts. Measured on a test mix: **10.5 dB of reduction while
speaking, 0.0 dB in the gaps.**

Without a key, captions still work: turn voiceover off and cues are timed from the
edit instead.

## Rendering

Four compositions, one per format, all driven by the same `Film` component:

```
pnpm sample                    # every format from the committed sample edit
pnpm sample portrait_9x16_30   # just one
pnpm sample --voice            # with a synthetic narration track
pnpm studio                    # interactive
```

**Title and end cards are overlaid, not appended.** Adding a 2-second title and a
3-second end card either side of a 30-second cut would produce a 35-second file
and break the duration contract the planner was held to. Both sit on top of the
opening and closing shots instead, and captions and the logo bug stop when the
end card comes up rather than showing through it.

**Smart cropping.** A landscape still in a vertical frame is cropped around the
focal point the vision pass recorded, via `object-position` — never a blind centre
crop, which reliably frames a shoulder and cuts off the face.

**The flag rules are in the renderer too, not only the planner.** An asset marked
as containing the Indian flag is letterboxed whole onto the brand ground —
`contain`, not `cover`, so nothing is cropped away — held still with no ken-burns
move, and carries no caption and no logo bug.

**Fonts are bundled, not fetched.** Fraunces, Marcellus and Poppins live in
`packages/video/fonts` as woff2 (67 KB total, all SIL Open Font License). A
renderer that reaches the network mid-frame fails on a bad connection and
silently falls back to a system font; the render also blocks until the faces are
loaded, so the first frames cannot be laid out in the wrong typeface.

## Making the films

**Make the films** on a project runs the whole pipeline: plan whatever is not
planned yet, narrate each cut, render it, and write a thumbnail. It is one job
with one progress bar, but each stage is its own child job, so the history says
which stage failed rather than just that something did.

Nothing is re-done needlessly. A cut that is already planned is reused, and
narration is only re-recorded when the cut changed — **Re-plan first** forces the
lot. Rendering an already-planned project needs no API key at all.

**Consent is checked again at render time**, against the assets as they are now.
The stored plan is a snapshot; consent is not. If someone withdraws consent after
a cut is planned, the render fails with the segment named rather than quietly
using the asset.

**↻ on any row re-plans that one shot.** The slot keeps its length, so the film's
duration and every other segment's timing are untouched — it is a swap, not a
re-edit. The replacement is validated against the whole cut before it is written.

Finished films appear on the project page with a player (captions attached), and
download links for the MP4, `.srt`, `.vtt` and thumbnail. Everything lands in
`renders/<jobId>/`.

## Rules the pipeline enforces

- Only assets with `consentCleared = true` reach the planner or a render. The
  filter defaults on, is enforced in the validator, and is re-checked at render
  time against the live database.
- Assets containing the Indian flag are never cropped, moved, or overlaid — no
  ken-burns, no caption, no logo, and letterboxed rather than cropped to fit.
- Originals in `media/` are never modified; outputs go to `renders/`.
- Each fixed-length cut lands within ±0.5s of its target, and no caption is on
  screen for less than 1.2s.

## Google Cloud setup

Needed only for the Google Photos and Drive sources. Roughly ten minutes.

**1. Create a project.** https://console.cloud.google.com → project picker →
**New project**. Name it whatever you like.

**2. Enable the two APIs.** APIs & Services → **Library**, then enable:

- **Photos Picker API** — lets the user pick items; the only supported way into
  Google Photos since the Library read scopes were removed in March 2025.
- **Google Drive API** — for the Drive folder source.

**3. Configure the OAuth consent screen.** APIs & Services → **OAuth consent
screen**:

- User type **External** (unless NeeRav has a Google Workspace domain, in which
  case **Internal** is simpler — no test users, no verification).
- App name, support email, developer contact. Nothing else is required while the
  app stays in testing.
- **Scopes**: add `.../auth/photospicker.mediaitems.readonly` and
  `.../auth/drive.readonly`. Both are sensitive scopes; while the app is in
  *Testing* that is fine and no verification is needed.
- **Test users**: add every Google account that will use ReelForge. An account
  that is not listed gets `access_denied` at the consent screen.

Leave the publishing status as **Testing**. Tokens for a testing app expire after
seven days, so you will reconnect in Settings about once a week. Publishing the
app would require Google's verification review, which is not worth it for a tool
used by a handful of people.

**4. Create the OAuth client.** APIs & Services → **Credentials** → **Create
credentials** → **OAuth client ID** → **Web application**:

- **Authorised redirect URI**: exactly `http://localhost:3000/api/auth/google/callback`
  — the Settings page prints the value the app will send, so copy it from there
  if you have changed `APP_URL` or `WEB_PORT`.
- No authorised JavaScript origins are needed.

**5. Put the client in `.env`** as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`,
restart `pnpm dev`, and press **Connect Google** in Settings.

ReelForge asks for offline access so it can refresh tokens, and stores both
tokens AES-256-GCM encrypted with `ENCRYPTION_KEY`. Disconnecting revokes the
grant at Google as well as deleting the row.

## Configuration

Every variable is documented in `.env.example`; these are the ones worth knowing.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:../prisma/dev.db` | SQLite locally; the schema is Postgres-compatible |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `pnpm dev` reuses an already-running Redis |
| `MEDIA_DIR` / `RENDERS_DIR` | `./media`, `./renders` | absolute paths work too |
| `ANTHROPIC_VISION_MODEL` | `claude-opus-5` | a cheaper model here is a real saving |
| `ANTHROPIC_VISION_EFFORT` | `low` | classification does not need more |
| `ANTHROPIC_PLANNING_MODEL` | `claude-opus-5` | the quality-critical call |
| `ANTHROPIC_PLANNING_EFFORT` | `high` | |
| `AI_MAX_BATCH_COST_USD` | `5.00` | refuses an oversized describe run |
| `ELEVENLABS_VOICE_ID` | — | the id from the voice library URL, not the name |
| `TTS_MAX_CHARS_PER_JOB` | `20000` | ElevenLabs bills per character |
| `RENDER_CONCURRENCY` | `2` | roughly one per two CPU cores |
| `REMOTION_BROWSER_EXECUTABLE` | — | must be a *headless shell* build |
| `ENABLE_SHARE_LINK_SCRAPER` | `false` | the unsupported source |

**Database.** SQLite in dev (`prisma/dev.db`). The schema avoids Prisma enums and
scalar lists so it applies unchanged to Postgres — switch the `datasource`
provider and point `DATABASE_URL` at a `postgresql://` URL.

**Music.** Tracks come from your own licensed library. Drop audio into
`assets/music/` and describe it in `assets/music/manifest.json`, then run
`pnpm db:seed`. Audio files are gitignored; the manifest, including the licence
note per track, is committed.

## Tests

`pnpm test` is the fast suite: schema and EDL rules, duration fitting, caption
timing, subtitle formatting, media probing, audio mixing and ducking, cost
estimates, and the request shapes sent to both APIs. Seconds, no network.

`pnpm test:e2e` runs the **whole pipeline over the fixture album** — upload,
catalogue, describe, plan, narrate, render — with local stand-ins for the two
APIs, into a temp database and temp media directories. Everything between those
stand-ins is the real code: the same job functions the worker runs. It asserts:

- five files catalogued with the right orientations, including the rotated clip;
- every asset described, tagged and priced, with the flagged one carrying its tag;
- a 30-second cut that lands within ±0.5s, with a continuous timeline and the
  flag corrections applied;
- narration aligned to words, `.srt` and `.vtt` written;
- **a render blocked** when an asset loses its consent after planning;
- a playable 1080×1920 file with an audio track and a thumbnail.

The render step needs a headless browser and is skipped, not failed, when
`REMOTION_BROWSER_EXECUTABLE` points at nothing.

## Troubleshooting

**`pnpm dev` says Redis could not start.** Docker is not running, or port 6379 is
taken. Either start Docker, or run `redis-server --port 6379` yourself — `pnpm
dev` reuses an already-listening instance. If Redis lives elsewhere, set
`REDIS_URL` in `.env`.

**"You must provide a nonempty URL" from Prisma.** `.env` is missing or
unreadable. Run `pnpm bootstrap`. The `.env` lives at the monorepo root; the web
app, the worker and the dev script all load it from there.

**A setting in `.env` seems to be ignored.** A real environment variable wins:
`.env` is loaded without overriding what is already exported in your shell (or set
by a container). `env | grep ANTHROPIC` will show a shadowing value.

**Prisma client not found, or stale types.** Run `pnpm db:generate`. The client is
generated into `packages/db/generated/client`, which is gitignored, so a fresh
clone needs it (`pnpm bootstrap` does it).

**Ignored build scripts on install.** pnpm 10 blocks postinstall scripts by
default; the allowed list is `pnpm.onlyBuiltDependencies` in the root
`package.json`. If you add a package with a native build step, add it there.

**Google says `redirect_uri_mismatch`.** The OAuth client's authorised redirect
URI must match `GOOGLE_REDIRECT_URI` exactly, including the port and the trailing
path. The Settings page prints the value the app will send.

**"State mismatch" after consenting.** The handshake finished in a different
browser, or the cookies were cleared. Start again from Settings; the PKCE verifier
and state live in HttpOnly cookies for ten minutes.

**Google returns 403 on the picker.** Enable the **Photos Picker API** for the
project, and check the consent screen actually granted
`photospicker.mediaitems.readonly` — a scope added after the first consent needs a
reconnect. `access_denied` instead means the account is not on the test-user list.

**Google asks you to sign in again every week.** Expected while the OAuth app is
in *Testing*: refresh tokens expire after seven days.

**Downloads come back small or without EXIF.** Something dropped the `=d` / `=dv`
suffix on the Picker `baseUrl`; that is what asks Google for the original bytes.

**ElevenLabs returns 422.** Usually an unknown or unset voice id. Set
`ELEVENLABS_VOICE_ID` to a voice the account can use — the id from the URL in the
ElevenLabs voice library, not the display name.

**The AI batch is refused as too expensive.** `AI_MAX_BATCH_COST_USD` caps a
single run. Narrow the scope to "not yet described", switch
`ANTHROPIC_VISION_MODEL` to a cheaper model, or raise the limit.

**Rendering fails with "Old Headless mode has been removed".**
`REMOTION_BROWSER_EXECUTABLE` is pointing at a full Chrome binary. Point it at a
`chrome-headless-shell` build instead, or unset it and let Remotion download its
own.

**A render shows black frames where pictures should be.** The renderer serves
media from `MEDIA_DIR`; check it points at the same library the ingest wrote to.

**A HEIC photo was skipped.** sharp's prebuilt libvips has no HEIC support, and
the FFmpeg fallback cannot always decode it either. Export as JPEG, or point
`FFMPEG_PATH` at a system FFmpeg built with libheif.

**Uploads fail immediately with a size error.** `MAX_UPLOAD_MB` (default 2048) is
per file, enforced while streaming.

**Port 3000 is busy.** Set `WEB_PORT` in `.env`, and update `APP_URL` plus the
Google redirect URI to match.

## Build progress

1. ✅ Monorepo, Prisma schema, `.env.example`, `pnpm dev` orchestration
2. ✅ Direct-upload ingest → probe → catalogue
3. ✅ Google Photos Picker + Drive folder ingest
4. ✅ AI descriptions and tags, with a cost estimate before running
5. ✅ Script → EDL planning with Zod validation
6. ✅ Remotion compositions for 16:9 and 9:16
7. ✅ ElevenLabs voiceover, word alignment, SRT/VTT, music ducking
8. ✅ End-to-end pipeline: progress, preview, per-segment regenerate, download
9. ✅ Tests: EDL validation, duration fitting, fixture-album end-to-end
10. ✅ README, Google Cloud walkthrough, troubleshooting

### What has not been proved

Every stage that calls an API has been exercised against local stand-ins, not
against Anthropic and ElevenLabs themselves. The plumbing is verified — request
shapes, error handling, cost accounting, timing arithmetic, the validator — but
no real model has judged a real photograph here, and no real voice has read a
line. Expect the first session with live keys to be about prompt quality and
voice choice rather than plumbing.
