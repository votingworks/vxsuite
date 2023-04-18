const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 82,
      functions: 95,
      lines: 94,
    },
  },
};
