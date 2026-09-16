import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setup.ts'],
    coverage: {
      exclude: [
        '**/*.test.ts',
        'src/jest_pdf_snapshot.ts',
        'src/cli/pdf_to_images.ts',
        'src/index.ts',
        'src/pdf.ts',
        'src/vitest_setup.ts',
      ],
    },
  },
});
