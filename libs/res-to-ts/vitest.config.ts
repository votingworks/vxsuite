import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      thresholds: {
        100: true,
      },
    },
  },
});
