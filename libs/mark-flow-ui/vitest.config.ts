import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    coverage: {
      exclude: ['**/*.stories.tsx', '**/*.test.tsx', '**/*.test.ts'],
    },
  },
});
