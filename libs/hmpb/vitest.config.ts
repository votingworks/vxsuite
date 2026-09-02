import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.bench.ts',
        // tested by src/preview.test.ts, but no coverage is collected
        'src/preview',
        'src/generate_fixtures.ts',
        'src/generate_vxprint_test_print.ts',
      ],
    },
  },
});
