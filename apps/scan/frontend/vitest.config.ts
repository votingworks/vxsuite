import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    // setupFiles: ['react-app-polyfill/jsdom'],
    // setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  },
});
