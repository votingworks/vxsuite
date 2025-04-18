import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
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
