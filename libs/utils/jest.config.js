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
      statements: 78,
      branches: 80,
      functions: 90,
      lines: 78,
    },
  },
};
