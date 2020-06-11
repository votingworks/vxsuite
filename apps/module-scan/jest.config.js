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
      statements: 95,
      branches: 76,
      functions: 98,
      lines: 95,
    },
  },
}
