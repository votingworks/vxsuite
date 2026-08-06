import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/ts/index.ts',
        'src/ts/demo.ts',
        'src/ts/mock_file_scanner.ts',
      ],
      // Remove after migration to coverage-check is complete
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
