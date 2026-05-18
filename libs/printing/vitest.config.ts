import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      // vitest 4's AST-aware coverage remapping drops branch coverage on
      // switch `default:` cases that v3 would ignore.
      thresholds: {
        lines: 100,
        branches: 99,
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
