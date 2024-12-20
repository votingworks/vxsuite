const shared = require('../../jest.config.shared');

/**
 * @type {import('@jest/types').Config.InitialOptions}
 */
module.exports = {
  ...shared,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
    },
  },
  coveragePathIgnorePatterns: [
    'src/reports/index.ts',
    'src/diagnostics/test_utils.ts',
    '.*\\.stories\\.ts',
    '.*\\.stories\\.tsx',
    // Purely presentational components:
    'src/voter_settings/theme_label.tsx',
    'src/voter_settings/theme_preview.tsx',
    'src/insert_ballot_image.tsx',
    'src/insert_card_image.tsx',
    'src/loading_animation.tsx',
    'src/printing_ballot_image.tsx',
    'src/rotate_card_image.tsx',
    'src/svg.tsx',
    'src/tabbed_section/.*.tsx?',
    'src/touch_text_input.tsx',
    'src/verify_ballot_image.tsx',
    'src/voter_contest_summary.tsx',
    'src/reports/tally_report.tsx',
    'src/double_feed_calibration_images.tsx',
  ],
  prettierPath: null,
  transform: {
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|mjs|cjs|ts|tsx)$',
  ],
};
