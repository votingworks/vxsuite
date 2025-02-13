import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    mockReset: true,
    setupFiles: ['react-app-polyfill/jsdom', 'src/setupTests.tsx'],
    coverage: {
      exclude: [
        'src/config',
        'src/stubs',
        'src/**/*.d.ts',
        'src/index.tsx',
        'src/contexts/ballot_context.ts',
        '**/*.test.{ts,tsx}',
      ],
      thresholds: {
        branches: 98,
      },
    },
    alias: [
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
  },
});
