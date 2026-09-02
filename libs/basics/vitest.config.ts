import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/iterators/index.ts'],
      thresholds: {
        lines: 100,
        branches: -1,
      },
    },
  },
});
