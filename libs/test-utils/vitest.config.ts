import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        global: {
          statements: 70,
          branches: 40,
          functions: 55,
          lines: 70,
        },
      },
      provider: 'istanbul',
      include: ['src/**/*.ts'],
    },
  },
});
