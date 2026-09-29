import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: [
        'src/ui_strings/*_test_runner.ts',
        'src/**/index.ts',
        'src/**/test_utils.ts',
      ],
    },
  },
});
