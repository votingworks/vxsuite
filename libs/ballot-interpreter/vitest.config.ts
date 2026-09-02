import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      exclude: [
        'src/index.ts',
        'src/bubble-ballot-ts/index.ts',
        'src/summary-ballot/index.ts',
        // Dev-only CLI
        'src/bubble-ballot-ts/diagnostic_cli.ts',
      ],
    },
  },
});
