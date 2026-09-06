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

FFmpeg is not required system-wide — the worker uses the bundled
`@ffmpeg-installer` binaries. Point `FFMPEG_PATH` / `FFPROBE_PATH` at a system
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

## Layout

```
apps/web        Next.js 14 App Router — UI and API routes; enqueues, never renders
apps/worker     BullMQ consumers — ingest, analyse, plan, tts, render
packages/shared Zod schemas, brand/format constants, EDL rules (no runtime deps)
packages/db     Prisma client, AES-256-GCM token encryption, path helpers
prisma/         schema.prisma, migrations, seed
media/          ingested originals — written once, never modified
renders/        outputs, one folder per job: mp4 + srt + vtt + thumbnail
assets/music/   your licensed music library (see the README in that folder)
```

Queues report progress by appending `JobEvent` rows; the web app streams those
over SSE, so progress survives a page reload or a worker restart.

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
2. ⬜ Direct-upload ingest → probe → catalogue
3. ⬜ Google Photos Picker + Drive folder ingest
4. ⬜ AI descriptions and tags, with a cost estimate before running
5. ⬜ Script → EDL planning with Zod validation
6. ⬜ Remotion compositions for 16:9 and 9:16
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

**Port 3000 is busy.** Set `WEB_PORT` in `.env`, and update `APP_URL` plus the
Google redirect URI to match.
