import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/ts/index.ts',
        'src/ts/demo.ts',
        'src/ts/mock_file_scanner.ts',
      ],
      thresholds: {
        lines: 100,
        branches: -3,
      },
    },
  },
});
