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
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/config/*',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/contexts/ballot_context.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      lines: 100,
      functions: 100,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.tsx'],
  transform: {
    '\\.tsx?$': '<rootDir>/test/transforms/babel.js',
  },
  moduleNameMapper: {
    '@votingworks/(.*)': '<rootDir>/../../libs/$1/src/index.ts',
    '^.+\\.css$': join(__dirname, 'test/stubs/css.js'),
  },
};
