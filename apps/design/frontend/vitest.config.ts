import { defineConfig } from '../../../vitest.config.shared.mjs';
import { join } from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setupTests.ts'],
    exclude: [
      'src/app.test.ts',
      'src/contests_screen.test.tsx',
      'src/election_info_screen.test.tsx',
      'src/elections_screen.test.tsx',
      'src/geography_screen.test.tsx',
      'src/features_context.test.tsx',
      'src/export_screen.test.tsx',
    ],

    coverage: {
      thresholds: {
        lines: 42,
        branches: 33,
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
