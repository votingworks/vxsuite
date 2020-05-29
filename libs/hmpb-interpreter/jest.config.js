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
      statements: 77,
      branches: 60,
      functions: 73,
      lines: 77,
    },
  },
}
