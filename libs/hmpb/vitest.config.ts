import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 89,
        branches: 79,
      },
      exclude: [
        // tested by src/preview.test.ts, but no coverage is collected
        'src/preview',
      ],
    },
  },
});
