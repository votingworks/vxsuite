const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 75,
      functions: 95,
      lines: 90,
    },
  },
  collectCoverageFrom: [...shared.collectCoverageFrom, '!src/debug.ts'],
};
