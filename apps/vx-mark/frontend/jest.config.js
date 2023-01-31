const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/config/*',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/contexts/ballot_context.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 96,
      branches: 87,
      functions: 96,
      lines: 96,
    },
  },
  resetMocks: true,
  setupFiles: ['react-app-polyfill/jsdom'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.tsx'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$',
  ],
};
