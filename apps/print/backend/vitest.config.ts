import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      // vitest 4's AST-aware coverage remapping drops line coverage and
      // bumps the uncovered branch count.
      thresholds: {
        lines: 97,
        branches: -8,
      },
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        'test/**/*',
        '**/*.d.ts',
        '**/types.ts',
        'src/**/index.ts',
        'src/util/get_current_time.ts',
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
    ],
  },
});
