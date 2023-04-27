const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coveragePathIgnorePatterns: [
    '.*\\.stories\\.ts',
    '.*\\.stories\\.tsx',
    // Purely presentational components:
    'src/display_settings/theme_label.tsx',
    'src/display_settings/theme_preview.tsx',
    'src/insert_ballot_image.tsx',
    'src/insert_card_image.tsx',
    'src/loading_animation.tsx',
    'src/rotate_card_image.tsx',
    'src/svg.tsx',
    'src/voter_contest_summary.tsx',
  ],
  transform: {
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$',
  ],
};
