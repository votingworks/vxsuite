module.exports = {
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/node_modules/**',
    '!src/index.ts',
    '!src/types.ts',
    '!test/**/*',
  ],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 80,
      functions: 91,
      lines: 89,
    },
  },
}
