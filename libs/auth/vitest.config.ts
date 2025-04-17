import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: -12,
        branches: -22,
      },
      exclude: [
        'src/cac/index.ts',
        'src/index.ts',
        'src/integration_test_utils.ts',
        'src/intermediate-scripts',
        'src/jurisdictions.ts',
        'src/test_utils.ts',
      ],
    },
  },
});
