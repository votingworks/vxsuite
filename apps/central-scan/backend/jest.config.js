const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  restoreMocks: true,
  // This is here because jest finds `build/__mocks__`,
  // which we should probably make not be there by using smarter
  // tsconfig.json values.
  roots: ['<rootDir>/src'],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!src/index.ts',
    '!src/types.ts',
    '!test/**/*',
  ],
  // Note that these thresholds are based on CI, which skips some of the tests
  // that run locally (e.g. in retry-scan/index.test.ts). Look for checks for
  // process.env.CI to figure out which ones. This makes coverage lower on CI,
  // so when updating these thresholds, it should be based on CI.
  coverageThreshold: {
    global: {
      statements: 88,
      branches: 72,
      functions: 88,
      lines: 89,
    },
  },
};
