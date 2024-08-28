const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -130,
      lines: -108,
    },
  },
  collectCoverageFrom: [...shared.collectCoverageFrom, '!src/debug.ts'],
  prettierPath: null,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
};
