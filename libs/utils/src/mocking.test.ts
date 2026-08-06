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

test('uses NODE_ENV when set (no runner project id)', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('MOON_PROJECT_ID', undefined);
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'test')
  );
});

test('namespaces the test env by the runner project id', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('MOON_PROJECT_ID', 'my/project!');
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'test', 'my_project_')
  );
});

test('ignores the runner project id outside the test env', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('MOON_PROJECT_ID', 'my-project');
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).toEqual(
    join(FAKE_REPO_ROOT, '.mock-state', 'development')
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
