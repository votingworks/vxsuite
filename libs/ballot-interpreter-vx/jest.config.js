const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [...shared.collectCoverageFrom, '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 60,
      lines: 80,
      functions: 80,
    },
  },
};
