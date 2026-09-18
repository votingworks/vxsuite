import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        'src/index.ts',
        'src/driver/index.ts',
        // Dev-only CLI
        'src/cli/driver_cli.ts',
      ],
    },
  },
});
