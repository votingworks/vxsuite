import { join } from 'node:path';
import { defineConfig } from '../../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: [
      './test/set_env_vars.ts',
      './test/setup_custom_matchers.ts',
      './test/setupTests.ts',
    ],
    coverage: {
      exclude: [
        '**/node_modules/**',
        '**/*.d.ts',
        'src/index.ts',
        'src/types.ts',
        // PoC: DeskPro (SCAMAX) WebSocket scanner bridge + demo entrypoint.
        // Hardware-integration code that can't be meaningfully unit-tested yet;
        // excluded from coverage until it's productionized.
        'src/deskpro_scanner.ts',
        'src/deskpro_demo.ts',
        '**/*.test.ts',
        'test/**/*',
      ],
      thresholds: {
        // TODO: Restore stricter thresholds once the network CVR transfer
        // prototype (networking.ts et al.) has full test coverage
        lines: -120,
        branches: -65,
      },
    },
    // Ensure only one instance of each library is loaded by loading the TS
    // source code instead of the compiled JS via different symlinks.
    alias: [
      {
        find: '@votingworks/auth',
        replacement: join(__dirname, '../../../libs/auth/src/index.ts'),
      },
      {
        find: '@votingworks/backend',
        replacement: join(__dirname, '../../../libs/backend/src/index.ts'),
      },
      {
        find: '@votingworks/types',
        replacement: join(__dirname, '../../../libs/types/src/index.ts'),
      },
      {
        find: '@votingworks/ui',
        replacement: join(__dirname, '../../../libs/ui/src/index.ts'),
      },
    ],
  },
});
