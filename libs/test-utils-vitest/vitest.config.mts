import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 84,
        branches: 79,
      },
      exclude: [
        'src/**/*.test.ts',
        'src/advance_timers.ts',
        'src/mock_of.ts',
        'src/mock_kiosk.ts',
        'src/mock_use_audio_controls.ts',
      ],
    },
  },
});
