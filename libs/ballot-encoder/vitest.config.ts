import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/expect.ts'],
    coverage: {
      // vitest 4's AST-aware coverage remapping counts TS function-overload
      // signatures as branches and won't ignore `default:` cases marked
      // with `/* istanbul ignore next */`.
      thresholds: {
        lines: 99,
        branches: 98,
      },
    },
  },
});
