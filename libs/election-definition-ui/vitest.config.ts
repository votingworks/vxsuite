import { join } from 'node:path';
import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],

    coverage: {
      exclude: ['src/index.ts'],
    },

    alias: [
      {
        find: '@votingworks/ui/test-utils',
        replacement: join(__dirname, '../ui/src/test_utils.ts'),
      },
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../ui/src/index.ts'),
      },
    ],
  },
});
