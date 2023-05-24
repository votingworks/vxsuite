const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  // This is here because jest finds `build/__mocks__`,
  // which we should probably make not be there by using smarter
  // tsconfig.json values.
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  coverageThreshold: {
    global: {
      statements: 98,
      branches: 92,
      functions: 100,
      lines: 98,
    },
  },
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!src/index.ts',
    '!src/types.ts',
    '!src/util/debug.ts',
    '!test/**/*',
  ],
};
