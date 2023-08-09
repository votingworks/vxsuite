const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 82,
      functions: 96,
      lines: 95,
    },
  },
};
