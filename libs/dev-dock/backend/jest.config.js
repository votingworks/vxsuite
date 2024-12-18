const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  coverageThreshold: {
    global: {
      branches: -1,
      lines: -15,
    },
  },
};
