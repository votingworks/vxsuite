module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/{src,test}/**/*.test.{ts,tsx}'],
  watchPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/build'],
  collectCoverageFrom: ['{src,test}/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      lines: 100,
      functions: 100,
    },
  },
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
}