module.exports = {
  preset: 'ts-jest',
  clearMocks: true,
  watchPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/build'],
  collectCoverageFrom: ['src/**/*.ts', '!src/api/module-scan.ts'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
}
