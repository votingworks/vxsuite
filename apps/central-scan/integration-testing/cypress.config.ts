import { defineConfig } from 'cypress';

/**
 * Define the configuration for the Cypress tests.
 */
export default defineConfig({
  viewportHeight: 1080,
  viewportWidth: 1920,
  defaultCommandTimeout: 8_000,
  e2e: {
    baseUrl: 'http://localhost:3000',
  },
});
