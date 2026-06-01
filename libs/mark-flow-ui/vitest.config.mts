import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 98,
        branches: 93,
      },
      exclude: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.test.ts'],
    },
  },
});
