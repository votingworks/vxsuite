import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'classic',
      pragma: 'h',
      pragmaFrag: 'Fragment',
    },
  },
  test: {
    include: ['driver/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'istanbul',
      all: true,
      include: ['fixtures/**/*.{ts,tsx}'],
      reporter: ['json'],
      reportsDirectory: './coverage',
    },
  },
});
