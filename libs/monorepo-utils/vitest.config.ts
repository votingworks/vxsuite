import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      // vitest 4's AST-aware coverage remapping drops branch coverage on
      // switch `default:` cases that v3 would ignore.
      thresholds: {
        lines: 100,
        branches: 97,
      },
    },
  },
});
