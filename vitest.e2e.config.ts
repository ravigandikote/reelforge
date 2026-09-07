import { defineConfig } from 'vitest/config'

/**
 * The end-to-end suite runs the real job functions over the fixture album with
 * local stand-ins for the two APIs. It writes to a temp database and temp media
 * directories, and takes minutes rather than seconds — hence its own config.
 */
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.spec.ts'],
    environment: 'node',
    globals: false,
    // The stages share state, so they must run in order in one worker.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
