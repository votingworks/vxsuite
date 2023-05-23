const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 87,
      functions: 97,
      lines: 95,
    },
  },
};
