import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      // vitest 4's AST-aware coverage remapping bumps the uncovered counts.
      thresholds: {
        lines: -75,
        branches: -75,
      },
      exclude: ['src/configure_sentry.ts', '**/*.test.ts'],
    },
    alias: [
      {
        find: '@votingworks/backend',
        replacement: join(__dirname, '../../../libs/backend/src/index.ts'),
      },
      {
        find: '@votingworks/types',
        replacement: join(__dirname, '../../../libs/types/src/index.ts'),
      },
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
    env: {
      // Vite automatically sets it to '/', which we don't want in tests.
      // Coerce undefined to '' so vitest 4 doesn't pass the literal string
      // "undefined" through to process.env.
      BASE_URL: process.env.BASE_URL ?? '',
    },
  },
});
