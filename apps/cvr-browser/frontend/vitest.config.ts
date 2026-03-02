import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setup_tests.ts'],

    coverage: {
      thresholds: {
        lines: 0,
        branches: 0,
      },
      exclude: [
        'src/**/*.d.ts',
        'src/index.tsx',
        '**/*.test.{ts,tsx}',
      ],
    },

    alias: [
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
  },
});
