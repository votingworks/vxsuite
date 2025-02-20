import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,

    coverage: {
      thresholds: {
        lines: -180,
        branches: -172,
      },
      exclude: ['src/**/*.d.ts', 'src/index.tsx'],
    },

    // Create alias for libs/ui to load the TS source code instead of the
    // compiled JS. This ensures we only have one instance of react-query, which
    // is necessary for tests to work correctly.
    alias: [
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
  },
});
