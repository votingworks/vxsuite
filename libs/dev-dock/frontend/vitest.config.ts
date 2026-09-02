import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      exclude: ['src/index.ts'],
      thresholds: {
        lines: -21,
        branches: -30,
      },
    },
  },
});
