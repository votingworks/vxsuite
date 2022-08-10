const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 52,
      branches: 39,
      functions: 54,
      lines: 54,
    },
  },
};
