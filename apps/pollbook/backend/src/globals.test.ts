import { afterEach, expect, test, vi } from 'vitest';
import { getWorkspace } from './globals.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('WORKSPACE takes precedence over the environment default', () => {
  vi.stubEnv('WORKSPACE', '/media/vx/workspace');
  vi.stubEnv('NODE_ENV', 'development');
  expect(getWorkspace()).toEqual('/media/vx/workspace');
});

test('falls back to the in-repo workspace in development', () => {
  vi.stubEnv('WORKSPACE', undefined);
  vi.stubEnv('NODE_ENV', 'development');
  expect(getWorkspace()).toMatch(/dev-workspace$/);
});

test('has no default outside development', () => {
  vi.stubEnv('WORKSPACE', undefined);
  vi.stubEnv('NODE_ENV', 'production');
  expect(getWorkspace()).toBeUndefined();
});
