module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/{src,test}/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/expect.ts'],
  collectCoverageFrom: ['{src,test}/**/*.ts', '!src/**/*.d.ts'],
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
