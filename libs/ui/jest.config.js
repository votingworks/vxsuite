module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  clearMocks: true,
  testPathIgnorePatterns: [
    "<rootDir>/build"
  ],
  watchPathIgnorePatterns: [
    "<rootDir>/node_modules",
    "<rootDir>/build"
  ],
  collectCoverageFrom: ['src/**/*.tsx'],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    },
  },
};
