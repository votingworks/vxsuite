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
  setupFiles: ['<rootDir>/test/set_env_vars.ts'],
  setupFilesAfterEnv: [
    '<rootDir>/test/setupTests.ts',
    '<rootDir>/test/setup_custom_matchers.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 98,
      lines: 99,
      functions: 98,
    },
  },
  coverageProvider: 'babel',
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!src/index.ts',
    '!src/types.ts',
    '!src/util/debug.ts',
    '!src/util/usb.ts',
    '!src/globals.ts',
    '!test/**/*',
  ],
  moduleNameMapper: {
    '^csv-stringify/sync':
      '<rootDir>/node_modules/csv-stringify/dist/cjs/sync.cjs',
    '^csv-parse/sync': '<rootDir>/node_modules/csv-parse/dist/cjs/sync.cjs',
  },
  prettierPath: null,
};
