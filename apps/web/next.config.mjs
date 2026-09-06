import { config as loadEnv } from 'dotenv'

// The .env lives at the monorepo root; Next only looks inside apps/web.
loadEnv({ path: new URL('../../.env', import.meta.url).pathname })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship as TypeScript source, so Next compiles them itself.
  transpilePackages: ['@reelforge/shared', '@reelforge/db', '@reelforge/media'],
  experimental: {
    // Keeps the monorepo root (media/, renders/, prisma/) resolvable from the app.
    outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
    // Native/binary deps must stay CommonJS requires on the server.
    serverComponentsExternalPackages: ['@prisma/client', 'bullmq', 'ioredis', 'sharp', 'fluent-ffmpeg'],
  },
  webpack: (config) => {
    // Workspace packages use ESM-correct '.js' specifiers that point at '.ts'
    // sources; webpack needs to be told to follow them.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}

export default nextConfig
