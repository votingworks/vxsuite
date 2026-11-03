import { expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace.js';

test('workspace.unconfigure resets the store', () => {
  using workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const fn = vi.fn();
  workspace.store.reset = fn;
  workspace.unconfigure();
  expect(fn).toHaveBeenCalledTimes(1);
});

test('workspace keeps the session and election package in separate DBs', () => {
  const root = makeTemporaryDirectory();
  using workspace = createWorkspace(root, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.store.getDbPath()).toEqual(join(root, 'session.db'));
  expect(workspace.electionPackageDbPath).toEqual(
    join(root, 'election-package.db')
  );
  expect(workspace.store.getElectionPackageStore().getDbPath()).toEqual(
    workspace.electionPackageDbPath
  );
});
