import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/ts/index.ts', 'src/ts/demo.ts'],
      thresholds: {
        lines: 100,
        branches: 93,
      },
    },
  },
});
