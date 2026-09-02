import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      // CLI entrypoints under src/bin are thin glue that build/*.js wrappers
      // invoke; exclude them from coverage like libs/utils does src/scripts.
      exclude: ['src/bin/**', 'src/index.ts'],
      thresholds: {
        lines: 100,
        branches: -1,
      },
    },
  },
});
