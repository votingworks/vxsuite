import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 100,
        branches: -1,
      },
      // Dev-only CLI entry points, compiled so the `scripts/` launchers can
      // import them rather than transpiling sources at run time. They lived
      // outside `src/` before, so they were never covered.
      exclude: ['src/scripts/**'],
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
