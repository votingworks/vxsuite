import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      exclude: ['src/index.ts', '**/*.test.ts'],
    },
  },
});
