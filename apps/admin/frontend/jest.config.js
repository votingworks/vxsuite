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
    '!src/demo_app.tsx',
    '!src/stubs/*',
  ],
  coverageThreshold: {
    global: {
      branches: -112,
      lines: -110,
    },
  },
  moduleFileExtensions: [
    'web.js',
    'js',
    'web.ts',
    'ts',
    'web.tsx',
    'tsx',
    'json',
    'web.jsx',
    'jsx',
    'node',
  ],
  moduleNameMapper: {
    '^react-native$': 'react-native-web',
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
  },
  modulePaths: [],
  resetMocks: true,
  roots: ['<rootDir>/src'],
  setupFiles: ['react-app-polyfill/jsdom'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
  ],
  transform: {
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  transformIgnorePatterns: [
    `[/\\\\]node_modules[/\\\\](?!\\.pnpm).+\\.(js|jsx|mjs|cjs|ts|tsx)$`,
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
};
