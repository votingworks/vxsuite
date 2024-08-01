/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  preset: 'ts-jest/presets/js-with-ts',
  clearMocks: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/{src,test}/**/*.test.{ts,tsx}'],
  watchPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/build'],
  modulePathIgnorePatterns: [
    '<rootDir>[/\\\\](build|docs|node_modules|deploy|scripts)[/\\\\]',
  ],
  collectCoverageFrom: ['{src,test}/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      lines: 100,
      functions: 100,
    },
  },
  testTimeout: 10_000,
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  cacheDirectory: '.jestcache',
  // pixelmatch contains ESM modules ending in .js, so we need to have
  // ts-jest transform them. We use this ignore pattern to not transform any
  // other node_modules except pixelmatch.
  transformIgnorePatterns: ['node_modules/(?!(.pnpm|pixelmatch))'],
};
