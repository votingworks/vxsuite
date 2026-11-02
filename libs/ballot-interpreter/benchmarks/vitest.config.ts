// @ts-ignore
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.bench.ts'],
    setupFiles: ['../test/setup.ts'],
    maxConcurrency: 1,
    testTimeout: 30_000,
  },
});
