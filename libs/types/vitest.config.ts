import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/index.ts',
        'src/cdf/*/index.ts',
        'src/cdf/ballot-definition/cli.ts',
      ],
    },
  },
});
