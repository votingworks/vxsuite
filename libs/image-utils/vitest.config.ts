import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      exclude: [
        '**/*.test.ts',
        'src/jest_pdf_snapshot.ts',
        'src/cli/pdf_to_images.ts',
      ],
    },
  },
});
