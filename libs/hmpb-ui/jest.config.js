module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}', '!**/*.d.ts'],
  coverageThreshold: {
    global: {
      statements: 78,
      branches: 71,
      functions: 83,
      lines: 78,
    },
  },
}
