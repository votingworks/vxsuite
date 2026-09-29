import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: ['src/index.ts'],
    },
  },
});
