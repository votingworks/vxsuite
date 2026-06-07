import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    // This library is entirely Playwright helpers exercised by apps' real
    // browser e2e runs, not by vitest. There are no unit tests, so exclude all
    // source from coverage to satisfy the global 100% threshold vacuously.
    passWithNoTests: true,
    coverage: {
      exclude: ['src/**'],
    },
  },
});
