import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    clearMocks: true,
    coverage: {
      thresholds: {
        lines: 85,
        branches: 81.1,
      },
      exclude: [
        '**/node_modules/**',
        '**/*.test.ts',
        'test/**/*',
        '**/*.d.ts',
        '**/types.ts',
        'src/**/index.ts',
        'src/barcode_scanner/client.ts',
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
