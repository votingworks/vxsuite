const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [...shared.collectCoverageFrom, '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 91,
      branches: 77,
      lines: 92,
      functions: 85,
    },
  },
};
