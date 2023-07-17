const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 99.75,
      functions: 100,
      lines: 100,
    },
  },
  coveragePathIgnorePatterns: [
    'src/cypress.ts',
    'src/index.ts',
    'src/intermediate-scripts',
    'src/jurisdictions.ts',
    'src/test_utils.ts',
  ],
};
