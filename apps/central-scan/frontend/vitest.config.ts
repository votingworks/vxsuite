import { join } from 'path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    mockReset: true,
    setupFiles: ['react-app-polyfill/jsdom', 'src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: -44,
        branches: -37,
      },
      exclude: [
        'src/config',
        'src/**/*.d.ts',
        'src/index.tsx',
        '**/*.test.{ts,tsx}',
        'src/stubs',
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
