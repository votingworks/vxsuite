module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  watchPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/build'],
  collectCoverageFrom: ['src/**/*.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
}
