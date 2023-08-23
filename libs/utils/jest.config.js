const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 96,
      functions: 95,
      lines: 97,
    },
  },
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!src/**/index.ts',
    '!src/env.d.ts',
    '!src/scripts/*.ts',
  ],
};
