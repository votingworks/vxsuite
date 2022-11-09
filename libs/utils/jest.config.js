const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coverageThreshold: {
    ...shared.coverageThreshold,
    // Moved from frontends/election-manager with pre-existing low coverage:
    ['src/votecounting.ts']: {
      statements: 69.59,
      branches: 72.22,
      functions: 64.28,
      lines: 69.13,
    }
  }
};
