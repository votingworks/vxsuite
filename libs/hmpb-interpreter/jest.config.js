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
      statements: 90,
      branches: 81,
      functions: 90,
      lines: 90,
    },
  },
}
