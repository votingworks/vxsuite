import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: 92,
        branches: 83,
      },
    },
    alias: [
      {
        find: '@votingworks/backend',
        replacement: join(__dirname, '../../../libs/backend/src/index.ts'),
      },
    ],
  },
});
