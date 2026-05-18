import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: ['src/cli.ts', 'src/mocks', 'src/**/*.test.ts'],
      // vitest 4's AST-aware coverage remapping drops branch coverage on
      // switch `default:` cases that v3 would ignore.
      thresholds: {
        lines: 99,
        branches: 98,
      },
    },
  },
});
