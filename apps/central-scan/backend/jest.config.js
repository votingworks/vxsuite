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
  setupFiles: ['<rootDir>/test/set_env_vars.ts'],
  coverageProvider: 'v8',
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!**/*.d.ts',
    '!src/index.ts',
    '!src/types.ts',
    '!test/**/*',
  ],
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 85,
      functions: 91,
      lines: 93,
    },
  },
};
