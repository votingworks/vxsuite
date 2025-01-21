import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/expect.ts'],
    coverage: {
      exclude: ['src/v3.ts'],
    },
  },
});
