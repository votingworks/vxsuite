import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: ['src/index.ts', 'src/test_utils.ts'],
    },
  },
});
