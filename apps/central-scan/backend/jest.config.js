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
  setupFilesAfterEnv: ['<rootDir>/test/setup_custom_matchers.ts'],
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
      statements: 94,
      branches: 86,
      functions: 91,
      lines: 94,
    },
  },
};
