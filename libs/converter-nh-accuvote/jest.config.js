const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -113,
      lines: -100,
    },
  },
  collectCoverageFrom: [...shared.collectCoverageFrom, '!src/debug.ts'],
  prettierPath: null,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
};
