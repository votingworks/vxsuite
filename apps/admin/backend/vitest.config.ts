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
        lines: -1,
        branches: -17,
      },
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        'src/index.ts',
        'src/types.ts',
        'src/util/debug.ts',
        'src/util/usb.ts',
        'src/globals.ts',
        '**/*.test.ts',
        'test/**/*',
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
