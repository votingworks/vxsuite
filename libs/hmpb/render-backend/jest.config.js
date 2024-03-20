const shared = require('../../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  preset: 'ts-jest/presets/js-with-ts',
  coverageThreshold: {
    global: {
      branches: -16,
      lines: -30,
    },
  },
  coveragePathIgnorePatterns: ['src/index.ts', 'src/generate_fixtures.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  // jest-image-matcher contains ESM modules ending in .js, so we need to have
  // ts-jest transform them. We use this ignore pattern to not transform any
  // other node_modules except jest-image-matcher.
  transformIgnorePatterns: ['node_modules/(?!(.pnpm|jest-image-matcher))'],
};
