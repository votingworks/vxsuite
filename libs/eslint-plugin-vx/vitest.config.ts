import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setupTests.ts'],
    coverage: {
      include: ['src/rules/*.ts'],
      exclude: [
        'src/rules/index.ts',
        'src/index.ts',
        'src/configs/*.ts',
        'src/util/index.ts',
      ],
      thresholds: {
        lines: -1,
        branches: -9,
      },
    },
  },
});
