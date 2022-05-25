const shared = require('../../jest.config.shared');
const { join } = require('path');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  // Remove `preset: 'ts-jest'` from the shared config.
  preset: undefined,
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/config/*",
    "!src/**/*.d.ts",
    "!src/index.tsx",
    "!src/serviceWorker.ts"
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 91,
      functions: 94,
      lines: 95
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  transform: {
    '\\.tsx?$': '<rootDir>/test/transforms/babel.js',
  },
  moduleNameMapper: {
    '@votingworks/([^/]*)': '<rootDir>/../../libs/$1/src/index.ts',
    '^.+\\.css$': join(__dirname, 'test/stubs/css.js'),
  },
};
