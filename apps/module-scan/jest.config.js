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
  ],
  coverageThreshold: {
    global: {
      statements: 88,
      branches: 67,
      functions: 88,
      lines: 88,
    },
  },
}
