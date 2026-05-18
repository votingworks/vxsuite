import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      // vitest 4's AST-aware coverage remapping bumps the uncovered branch
      // count and finds some lines previously hidden by `istanbul ignore`.
      thresholds: {
        lines: 98,
        branches: -35,
      },
    },
  },
});
