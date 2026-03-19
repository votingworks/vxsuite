import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      exclude: [
        '**/index.ts',
        'src/generate-election',
        'src/generate-election-package',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: -4,
        branches: -18,
      },
    },
    alias: [
      {
        find: '@votingworks/backend',
        replacement: join(import.meta.dirname, '../backend/src/index.ts'),
      },
      {
        find: '@votingworks/utils',
        replacement: join(import.meta.dirname, '../utils/src/index.ts'),
      },
    ],
  },
});
