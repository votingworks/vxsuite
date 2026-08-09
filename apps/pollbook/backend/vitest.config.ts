import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: -128,
        branches: -101,
      },
      exclude: [
        // Dev-only CLI entry points, compiled so the `scripts/` launchers can
        // import them rather than transpiling sources at run time. They lived
        // outside `src/` before, so they were never counted.
        'src/scripts/**',
        '**/node_modules/**',
        '**/*.test.ts',
        'test/**/*',
        '**/*.d.ts',
        '**/types.ts',
        'src/**/index.ts',
      ],
    },
    // Ensure only one instance of each library is loaded by loading the TS
    // source code instead of the compiled JS via different symlinks.
    alias: [
      {
        find: '@votingworks/auth',
        replacement: join(__dirname, '../../../libs/auth/src/index.ts'),
      },
      {
        find: '@votingworks/backend',
        replacement: join(__dirname, '../../../libs/backend/src/index.ts'),
      },
      {
        find: '@votingworks/networking',
        replacement: join(__dirname, '../../../libs/networking/src/index.ts'),
      },
    ],
  },
});
