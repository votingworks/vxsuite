import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: -2,
        branches: -10,
      },
      exclude: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.test.ts'],
    },
  },
});
