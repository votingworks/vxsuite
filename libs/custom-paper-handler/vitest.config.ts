import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: {
      exclude: [
        'src/index.ts',
        'src/driver/index.ts',
        // Dev-only CLI
        'src/cli/driver_cli.ts',
        // Test double used by libs/fujitsu-thermal-printer's tests
        'src/driver/mock_minimal_web_usb_device.ts',
      ],
      thresholds: {
        lines: 0,
        branches: 0,
      },
    },
  },
});
