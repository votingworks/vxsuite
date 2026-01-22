import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: -71,
        branches: -56,
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
      // Vite automatically sets it to '/', which we don't want in tests
      BASE_URL: process.env.BASE_URL,
    },
  },
});
