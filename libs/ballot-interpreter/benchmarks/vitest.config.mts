// @ts-ignore
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['**/*.bench.mts'],
    maxConcurrency: 1,
  },
});
