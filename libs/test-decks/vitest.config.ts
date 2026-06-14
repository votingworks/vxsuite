import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 100,
        branches: 100,
      },
    },
    alias: [
      {
        find: '@votingworks/types',
        replacement: join(__dirname, '../types/src/index.ts'),
      },
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../ui/src/index.ts'),
      },
    ],
  },
});
