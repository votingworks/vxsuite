import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 84,
        branches: 79,
      },
      provider: 'istanbul',
      include: ['src/**/*.ts'],
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
