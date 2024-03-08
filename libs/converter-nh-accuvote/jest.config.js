const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -74,
      lines: -35,
    },
  },
  collectCoverageFrom: [...shared.collectCoverageFrom, '!src/debug.ts'],
  prettierPath: null,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
};
