import { fileURLToPath } from 'node:url';
import * as vitest from 'vitest/config';

const isCI = process.env['CI'] === 'true';

// Resolved from this file rather than the consuming package, since setup file
// paths are otherwise interpreted relative to each package's root.
const sharedSetupFile = fileURLToPath(
  new URL('./vitest.setup.shared.mts', import.meta.url)
);

export const base: vitest.ViteUserConfig = {
  test: {
    setupFiles: [sharedSetupFile],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      thresholds: {
        lines: 100,
        branches: 100,
      },
      reportOnFailure: true,
      provider: 'istanbul',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
    clearMocks: true,
    maxWorkers: isCI ? 6 : undefined,
    reporters: isCI ? ['verbose', 'junit'] : [],
    outputFile: isCI ? 'reports/junit.xml' : undefined,
    testTimeout: isCI ? 10_000 : undefined,
  },
};

export function defineConfig(
  config: vitest.ViteUserConfig = {}
): vitest.ViteUserConfig {
  return vitest.defineConfig(vitest.mergeConfig(base, config));
}
