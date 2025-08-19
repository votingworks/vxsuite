import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: -71,
        branches: -53,
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
  },
});
