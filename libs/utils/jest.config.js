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
      branches: -31,
      lines: -128,
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
