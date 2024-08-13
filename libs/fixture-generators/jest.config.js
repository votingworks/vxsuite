const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [
    ...shared.collectCoverageFrom,
    '!src/**/index.ts',
    // We don't have tests for generate-election because all that matters is
    // that it creates a valid election (which it checks when generating the
    // election).
    '!src/generate-election/*',
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 80,
      functions: 100,
      lines: 95,
    },
  },
  prettierPath: null,
};
