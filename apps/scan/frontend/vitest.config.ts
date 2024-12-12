import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],

    coverage: {
      thresholds: {
        lines: 94,
        branches: 84,
      },
      exclude: [
        'src/config/*',
        'src/**/*.d.ts',
        'src/index.tsx',
        'src/stubs/*',
      ],
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
