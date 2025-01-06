// @ts-ignore
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.bench.ts'],
    maxConcurrency: 1,
  },
});
