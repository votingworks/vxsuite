import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    restoreMocks: true,
    coverage: {
      // vitest 4's AST-aware coverage remapping no longer fully honors
      // `/* istanbul ignore next */` on ternary branches.
      thresholds: {
        lines: 100,
        branches: 98,
      },
    },
  },
});
