const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coveragePathIgnorePatterns: [
    'test',
  ],
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 94,
      functions: 100,
      lines: 98,
    },
  },
};
