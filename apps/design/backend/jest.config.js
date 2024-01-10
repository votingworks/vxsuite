const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -20,
      lines: -73,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  prettierPath: null,
};
