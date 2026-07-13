import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['./test/setupTests.ts'],
    coverage: {
      exclude: ['src/ui_strings/**'],
      thresholds: {
        lines: -15,
        // TODO: Restore -31 once the network CVR transfer prototype has full
        // test coverage
        branches: -33,
      },
    },
  },
});
