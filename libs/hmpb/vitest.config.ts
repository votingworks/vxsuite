import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 92,
        branches: 84,
      },
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        // tested by src/preview.test.ts, but no coverage is collected
        'src/preview',
        'src/generate_fixtures.ts',
      ],
    },
  },
});
