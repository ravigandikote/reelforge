import { z } from 'zod'

/**
 * Server-side env parsing. Import from '@reelforge/shared/env' — never from a
 * client component; these values include secrets.
 */
const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  ENCRYPTION_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Point the SDK at a gateway or proxy instead of api.anthropic.com. Empty is
   * treated as unset, since .env.example ships the key with no value.
   */
  ANTHROPIC_BASE_URL: z
    .union([z.string().url(), z.literal('')])
    .optional()
    .transform((value) => (value ? value : undefined)),
  ANTHROPIC_VISION_MODEL: z.string().default('claude-opus-5'),
  /** Vision tagging is a classification task; low effort keeps a library-wide run cheap. */
  ANTHROPIC_VISION_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  ANTHROPIC_PLANNING_MODEL: z.string().default('claude-opus-5'),
  AI_MAX_BATCH_COST_USD: z.coerce.number().default(5),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_SCOPES: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),

  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  MEDIA_DIR: z.string().default('./media'),
  RENDERS_DIR: z.string().default('./renders'),
  MUSIC_DIR: z.string().default('./assets/music'),
  MAX_UPLOAD_MB: z.coerce.number().default(2048),

  RENDER_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  REMOTION_BROWSER_EXECUTABLE: z.string().optional(),

  ENABLE_SHARE_LINK_SCRAPER: boolish,
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment.\n${issues}\n\nCopy .env.example to .env and run \`pnpm setup\`.`)
  }
  cached = parsed.data
  return cached
}

/** Throws a readable error when a feature is used before its key is configured. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key]
  if (value === undefined || value === '') {
    throw new Error(`${String(key)} is not set. Add it to your .env (see .env.example).`)
  }
  return value as NonNullable<Env[K]>
}
