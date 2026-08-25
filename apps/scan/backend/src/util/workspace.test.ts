import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace, getScanWorkspace, resolveWorkspace } from './workspace.js';
import { Store } from '../store.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('createWorkspace', () => {
  const dir = makeTemporaryDirectory();
  const workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir);
  expect(workspace.store).toBeInstanceOf(Store);
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

test('resolveWorkspace opens the workspace SCAN_WORKSPACE names', () => {
  const dir = makeTemporaryDirectory();
  vi.stubEnv('SCAN_WORKSPACE', dir);

  const workspace = resolveWorkspace(mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir);
  expect(workspace.store).toBeInstanceOf(Store);
});

test('resolveWorkspace fails when there is no workspace to resolve', () => {
  vi.stubEnv('SCAN_WORKSPACE', undefined);
  vi.stubEnv('NODE_ENV', 'production');

  expect(() => resolveWorkspace(mockBaseLogger({ fn: vi.fn }))).toThrow(
    'workspace path could not be determined'
  );
});
