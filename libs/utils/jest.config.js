const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
    // Moved from frontends/election-manager with pre-existing low coverage:
    'src/votecounting.ts': {
      statements: 77,
      branches: 73,
      functions: 89,
      lines: 76,
    },
  },
  collectCoverageFrom: [
    '!jest.config.js',
    '!coverage/**/*',
    '!src/data/*',
    '!src/__snapshots__/*',
    '!src/manual_tallies_test_utils.ts',
  ],
};
