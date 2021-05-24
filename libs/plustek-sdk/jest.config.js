module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/build',
  ],
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/build',
  ],
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
}
