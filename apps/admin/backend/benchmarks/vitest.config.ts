import { join } from 'node:path';
// @ts-ignore
import { defineConfig } from '../../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.bench.ts'],
    setupFiles: ['../test/set_env_vars.ts'],
    maxConcurrency: 1,
    fileParallelism: false,
    // Run all bench files in one worker so they share the seeded store cache
    // (and RESET_CACHED_STORE resets it once, not once per file)
    isolate: false,
    testTimeout: 60 * 60_000,
    hookTimeout: 60 * 60_000,
    // Ensure only one instance of each library is loaded by loading the TS
    // source code instead of the compiled JS via different symlinks.
    alias: [
      {
        find: '@votingworks/auth',
        replacement: join(__dirname, '../../../../libs/auth/src/index.ts'),
      },
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../../libs/ui/src/index.ts'),
      },
      {
        find: '@votingworks/types',
        replacement: join(__dirname, '../../../../libs/types/src/index.ts'),
      },
      {
        find: '@votingworks/backend',
        replacement: join(__dirname, '../../../../libs/backend/src/index.ts'),
      },
    ],
  },
});
