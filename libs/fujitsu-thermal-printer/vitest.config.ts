import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/driver/index.ts'],
    },
  },
});
