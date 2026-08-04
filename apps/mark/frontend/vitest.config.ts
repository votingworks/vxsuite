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
        // Hardware-test app code — not exercised by unit tests (only wired
        // up via index.tsx, which is itself excluded).
        'src/electrical_testing',
        '**/*.test.{ts,tsx}',
      ],
      thresholds: {
        lines: -5,
        branches: -5,
      },
    },
    alias: [
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
      {
        find: '@votingworks/mark-flow-ui',
        replacement: join(__dirname, '../../../libs/mark-flow-ui/src/index.ts'),
      },
    ],
  },
});
