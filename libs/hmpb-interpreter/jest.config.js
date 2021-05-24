module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/'],
  collectCoverageFrom: ['src/**/*', '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 81,
      functions: 90,
      lines: 90,
    },
  },
}
