import * as vitest from 'vitest/config';

const isCI = process.env['CI'] === 'true';

export const base: vitest.ViteUserConfig = {
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      thresholds: {
        lines: 100,
        branches: 100,
      },
      provider: 'istanbul',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
    minWorkers: isCI ? 1 : undefined,
    maxWorkers: isCI ? 6 : undefined,
    reporters: isCI ? ['verbose', 'junit'] : [],
    outputFile: isCI ? 'reports/junit.xml' : undefined,
  },
};

/**
 * Merge two objects recursively. Merges only objects, not arrays, strings, etc.
 * If the two values cannot be merged, then `b` is used.
 */
function merge(a: any, b: any): any {
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    !a ||
    !b ||
    Array.isArray(a) ||
    Array.isArray(b)
  ) {
    return b;
  }

  const result: any = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = merge(a[key], value);
  }
  return result;
}

export function defineConfig(
  config: vitest.ViteUserConfig = {}
): vitest.ViteUserConfig {
  return vitest.defineConfig(merge(base, config));
}
