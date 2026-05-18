import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['./test/mock_writable.ts', '**/*.test.ts'],
      thresholds: {
        lines: 100,
        // vitest 4's AST-aware coverage remapping bumps the uncovered count.
        branches: -8,
      },
    },
  },
});
