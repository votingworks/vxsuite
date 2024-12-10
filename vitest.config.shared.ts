import * as vitest from 'vitest/config';

export const base: vitest.ViteUserConfig = {
  test: {
    coverage: {
      thresholds: {
        lines: 100,
        branches: 100,
      },
      provider: 'istanbul',
      include: ['src/**/*.ts'],
    },
    maxWorkers: process.env.CI ? 6 : undefined,
    reporters: process.env.CI ? ['junit'] : [],
    outputFile: process.env.CI ? 'reports/junit.xml' : undefined,
  },
};

/**
 * Merge two objects recursively. Merges only objects, not arrays, strings, etc.
 * If the two values cannot be merged, then `b` is used.
 */
function merge<T>(a: T, b: T): T {
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

  const result: T = { ...a };
  for (const [key, value] of Object.entries(b)) {
    result[key] = merge(a[key], value);
  }
  return result;
}

export function defineConfig(
  config: vitest.ViteUserConfig
): vitest.ViteUserConfig {
  return vitest.defineConfig(merge(base, config));
}
