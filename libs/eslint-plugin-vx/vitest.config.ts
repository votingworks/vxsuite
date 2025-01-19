import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupTests.ts'],
    coverage: {
      include: ['src/rules/*.ts'],
      exclude: ['src/rules/index.ts'],
      thresholds: {
        lines: 99,
        branches: 98,
      },
    },
  },
});
