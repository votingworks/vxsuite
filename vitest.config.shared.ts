import * as vitest from 'vitest/config';

export const base: vitest.ViteUserConfig = {
  test: {
    coverage: {
      thresholds: { 100: true },
      provider: 'istanbul',
      include: ['src/**/*.ts'],
    },
    maxWorkers: process.env.CI ? 6 : undefined,
    reporters: process.env.CI ? ['junit'] : [],
    outputFile: process.env.CI ? 'reports/junit.xml' : undefined,
  },
};

export function defineConfig(
  config: vitest.ViteUserConfig
): vitest.ViteUserConfig {
  const { test, ...rest } = config;
  return vitest.defineConfig({
    ...base,
    ...rest,
    test: {
      ...base.test,
      ...test,
    },
  });
}
