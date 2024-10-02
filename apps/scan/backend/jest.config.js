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
  setupFilesAfterEnv: [
    '<rootDir>/test/setup_custom_matchers.ts',
    '<rootDir>/test/setupTests.ts',
  ],
  coverageProvider: 'babel',
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!test/**/*',
    '!**/*.d.ts',
    '!**/types.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: -73,
      lines: -53,
    },
  },
};
