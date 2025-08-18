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
      thresholds: {
        lines: -21,
        branches: -22,
      },
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        '**/*.test.ts',
        'src/index.ts',
        'src/types.ts',
        'test/**/*',
        'src/util/auth.ts',
        'src/custom-paper-handler/cli/state_machine_cli.ts',
        'src/electrical_testing/**', // TODO: Add tests for this directory and remove this exclude
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
        find: '@votingworks/ballot-interpreter',
        replacement: join(
          __dirname,
          '../../../libs/ballot-interpreter/src/index.ts'
        ),
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
