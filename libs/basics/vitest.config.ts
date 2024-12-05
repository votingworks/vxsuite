import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      thresholds: { 100: true },
      provider: 'istanbul',
      include: ['src/**/*.ts'],
    },
  },
});
