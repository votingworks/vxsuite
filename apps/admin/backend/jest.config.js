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
      branches: 95,
      functions: 99.3,
      lines: 98,
    },
  },
  coverageProvider: 'v8',
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
  },
};
