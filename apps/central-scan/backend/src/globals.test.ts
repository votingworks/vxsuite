import { afterEach, expect, test, vi } from 'vitest';
import { getScanWorkspace } from './globals.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('SCAN_WORKSPACE takes precedence over the environment default', () => {
  vi.stubEnv('SCAN_WORKSPACE', '/media/vx/workspace');
  vi.stubEnv('NODE_ENV', 'development');
  expect(getScanWorkspace()).toEqual('/media/vx/workspace');
});

test('falls back to the in-repo workspace in development', () => {
  vi.stubEnv('SCAN_WORKSPACE', undefined);
  vi.stubEnv('NODE_ENV', 'development');
  expect(getScanWorkspace()).toMatch(/dev-workspace$/);
});

test('has no default outside development', () => {
  vi.stubEnv('SCAN_WORKSPACE', undefined);
  vi.stubEnv('NODE_ENV', 'production');
  expect(getScanWorkspace()).toBeUndefined();
});
