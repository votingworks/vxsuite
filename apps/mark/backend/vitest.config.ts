import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: [
      './test/set_env_vars.ts',
      './test/setupTests.ts',
      './test/setup_custom_matchers.ts',
    ],
    coverage: {
      // vitest 4's AST-aware coverage remapping drops line coverage and
      // bumps the uncovered branch count.
      thresholds: {
        lines: 99,
        branches: -5,
      },
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        'src/index.ts',
        'src/types.ts',
        '**/*.test.ts',
        'test/**/*',
        'src/util/accessible_controller.ts',
        'src/electrical_testing/**',
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
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
  },
});
