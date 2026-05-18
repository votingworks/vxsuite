import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: [
        'src/cac/index.ts',
        'src/index.ts',
        'src/integration_test_utils.ts',
        'src/intermediate-scripts',
        'src/jurisdictions.ts',
        'src/test_utils.ts',
      ],
      // vitest 4's AST-aware coverage remapping no longer honors
      // `/* istanbul ignore next */` placed before switch `default:` cases,
      // and counts TS function-overload signatures as branches. Drop
      // thresholds slightly to accommodate.
      thresholds: {
        lines: 97,
        branches: 94,
      },
    },
  },
});
