import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/ts/index.ts', 'src/ts/demo.ts'],
      // vitest 4's AST-aware coverage remapping bumps the uncovered counts.
      thresholds: {
        lines: -6,
        branches: -6,
      },
    },
  },
});
