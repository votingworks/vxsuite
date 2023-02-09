import { defineConfig } from 'cypress';

import { readMostRecentFile } from './cypress/support/read_most_recent_file';

/**
 * Define the configuration for the Cypress tests.
 */
export default defineConfig({
  viewportHeight: 1080,
  viewportWidth: 1920,
  defaultCommandTimeout: 8_000,
  e2e: {
    setupNodeEvents(on) {
      on('task', { readMostRecentFile });
    },
    baseUrl: 'http://localhost:3000',
  },
});
