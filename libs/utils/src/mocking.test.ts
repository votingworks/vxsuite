import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getMockStateRootDir } from './mocking.js';

const FAKE_REPO_ROOT = '/fake/repo';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VITEST_WORKER_ID', undefined);
  vi.stubEnv('npm_package_name', undefined);
  vi.stubEnv('VX_MOCK_STATE_RUN_ID', 'run1');
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

test('isolates vitest workers by package, run and worker id, outside the repo', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST_WORKER_ID', '2');
  vi.stubEnv('npm_package_name', '@votingworks/printing');
  const dir = getMockStateRootDir(FAKE_REPO_ROOT);
  expect(dir.startsWith(join(tmpdir(), 'vx-mock-state', 'test'))).toEqual(true);
  expect(dir.endsWith('-_votingworks_printing-run1-2')).toEqual(true);
});

test('names the package segment when it is unavailable', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST_WORKER_ID', '0');
  const dir = getMockStateRootDir(FAKE_REPO_ROOT);
  expect(dir.endsWith('-unknown-run1-0')).toEqual(true);
});

test('publishes a run id so spawned helpers resolve the same directory', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST_WORKER_ID', '1');
  vi.stubEnv('npm_package_name', '@votingworks/auth');
  vi.stubEnv('VX_MOCK_STATE_RUN_ID', undefined);

  const dir = getMockStateRootDir(FAKE_REPO_ROOT);

  expect(dir.endsWith(`-_votingworks_auth-${process.pid}-1`)).toEqual(true);
  expect(process.env['VX_MOCK_STATE_RUN_ID']).toEqual(String(process.pid));
});

test('keeps worktrees running the same suite apart', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('VITEST_WORKER_ID', '2');
  vi.stubEnv('npm_package_name', '@votingworks/printing');
  expect(getMockStateRootDir(FAKE_REPO_ROOT)).not.toEqual(
    getMockStateRootDir('/another/repo')
  );
});
