const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: -617,
      lines: -1118,
    },
  },
  modulePathIgnorePatterns: [
    '<rootDir>/src/app.test.ts',
    '<rootDir>/src/ballot_order_info_screen.test.tsx',
    '<rootDir>/src/contests_screen.test.tsx',
    '<rootDir>/src/ballot_screen.test.tsx',
    '<rootDir>/src/tabulation_screen.test.tsx',
    '<rootDir>/src/election_info_screen.test.tsx',
    '<rootDir>/src/elections_screen.test.tsx',
    '<rootDir>/src/ballots_screen.test.tsx',
    '<rootDir>/src/geography_screen.test.tsx',
    '<rootDir>/src/features_context.test.tsx',
    '<rootDir>/src/export_screen.test.tsx',
  ],
  setupFiles: ['react-app-polyfill/jsdom'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  transform: {
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$',
  ],
};
