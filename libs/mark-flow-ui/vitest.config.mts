import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 99,
        branches: 96,
      },
      exclude: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.test.ts'],
    },
  },
});
