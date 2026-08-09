import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],

    coverage: {
      thresholds: {
        lines: -30,
        branches: -104,
      },
      exclude: [
        // Dev-only CLI entry points, compiled so the `scripts/` launchers can
        // import them rather than transpiling sources at run time. They lived
        // outside `src/` before, so they were never counted.
        'src/scripts/**',
        'src/reports/index.ts',
        'src/diagnostics/test_utils.ts',
        '**/*.stories.ts',
        '**/*.stories.tsx',
        // Covered in VxAdmin
        // TODO (Kevin) move coverage to this library
        'src/printer_alert.tsx',
        // Purely presentational components:
        'src/voter_settings/theme_label.tsx',
        'src/voter_settings/theme_preview.tsx',
        'src/insert_ballot_image.tsx',
        'src/insert_card_image.tsx',
        'src/loading_animation.tsx',
        'src/printing_ballot_image.tsx',
        'src/rotate_card_image.tsx',
        'src/svg.tsx',
        'src/tabbed_section/*.tsx',
        'src/touch_text_input.tsx',
        'src/verify_ballot_image.tsx',
        'src/voter_contest_summary.tsx',
        'src/reports/tally_report.tsx',
        'src/double_feed_calibration_images.tsx',
      ],
    },
  },
});
