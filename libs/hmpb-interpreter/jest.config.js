module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/node_modules/'],
  globals: {
    'ts-jest': {
      packageJson: 'package.json',
    },
  },
  collectCoverageFrom: ['src/**/*', '!test/fixtures/**/*'],
  coverageThreshold: {
    global: {
      statements: 84,
      branches: 69,
      functions: 79,
      lines: 84,
    },
  },
}
