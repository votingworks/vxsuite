const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      branches: -11,
      lines: -7,
    },
  },
  watchPathIgnorePatterns: [
    ...shared.watchPathIgnorePatterns,
    '<rootDir>/benchmarks',
  ],
};
