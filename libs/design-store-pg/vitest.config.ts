import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts'],
    },
    env: {
      BASE_URL: process.env.BASE_URL ?? '',
    },
  },
});
