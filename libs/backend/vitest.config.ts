import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      exclude: [
        'src/ui_strings/*_test_runner.ts',
        'src/**/index.ts',
        'src/**/test_utils.ts',
      ],
      thresholds: {
        lines: -15,
        branches: -31,
      },
    },
  },
});
