import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The end-to-end suite is opt-in: it renders video and takes minutes.
    // `pnpm test:e2e` runs it; `pnpm test:all` runs everything.
    include: ['tests/**/*.spec.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    environment: 'node',
    globals: false,
    // Several tests shell out to ffmpeg or load sharp's native binding. The 5s
    // default is enough once those are warm and not on the first run after a
    // clone, which is the run a newcomer sees.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
