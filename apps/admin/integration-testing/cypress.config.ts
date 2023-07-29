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
    specPattern: [
      'cypress/e2e/**/*.cy.ts',
      // we're skipping all tests within these files because we don't have USB
      // mocking - by skipping the whole file we get the performance benefits
      '!cypress/e2e/candidate_contest_tallies.cy.ts',
      '!cypress/e2e/tallies.cy.ts',
      '!cypress/e2e/yes_no_contest_tallies.cy.ts',
    ],
    baseUrl: 'http://localhost:3000',
  },
});
