import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { getMockStateRootDir } from './mocking';

const FAKE_REPO_ROOT = '/fake/repo';

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('uses NODE_ENV when set', () => {
  vi.stubEnv('NODE_ENV', 'test');
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'test')
  );
});

test('sanitizes NODE_ENV for use as a path segment', () => {
  vi.stubEnv('NODE_ENV', 'my/env!');
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'my_env_')
  );
});

test('falls back to development when NODE_ENV is not set', () => {
  vi.stubEnv('NODE_ENV', undefined);
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'development')
  );
});
