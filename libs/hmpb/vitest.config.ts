import { defineConfig } from '../../vitest.config.shared.mjs';

export default defineConfig({
  test: {
    setupFiles: ['test/setupTests.ts'],
    coverage: {
      thresholds: {
        lines: 87,
        branches: 79,
      },
      exclude: [
        // tested by src/preview.test.ts, but no coverage is collected
        'src/preview',
        // tested in VxDesign, the only consumer, but coverage should be added here to reduce fragility
        'src/ballot_templates/nh_ballot_template.tsx',
      ],
    },
  },
});
