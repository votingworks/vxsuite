import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/index.ts',
        'src/cli/**/*.ts',
        'src/mocks/**/*.ts',
        'src/types/**/*.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: -4,
        branches: -5,
      },
    },
  },
});
