import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      // vitest 4's AST-aware coverage remapping counts TS function-overload
      // signatures (e.g. zipMin overloads in iterator_plus.ts) as branches.
      thresholds: {
        lines: 100,
        branches: 99,
      },
    },
  },
});
