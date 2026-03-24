import { defineConfig } from "vxsuite/vitest.config.shared.mjs";

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      thresholds: {
        lines: 100,
        branches: 100,
      },
    },
  },
});
