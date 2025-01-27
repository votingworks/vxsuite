import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: [
      './test/set_env_vars.ts',
      './test/setup_custom_matchers.ts',
      './test/setupTests.ts',
    ],
    coverage: {
      exclude: [
        '**/node_modules/**',
        '**/*.d.ts',
        'src/index.ts',
        'src/types.ts',
        '**/*.test.ts',
        'test/**/*',
      ],
      thresholds: {
        lines: 90,
        branches: 82,
      },
    },
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
