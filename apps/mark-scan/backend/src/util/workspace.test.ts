import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { Store } from '../store.js';
import { createWorkspace } from './workspace.js';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
}));

test('createWorkspace', () => {
  const dir = makeTemporaryDirectory();
  using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir);
  expect(workspace.store).toBeInstanceOf(Store);
  expect(workspace.store.getDbPath()).toEqual(join(dir, 'session.db'));
  expect(workspace.electionPackageDbPath).toEqual(
    join(dir, 'election-package.db')
  );
});

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

test('dispose closes the store', () => {
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  workspace[Symbol.dispose]();
  expect(() => workspace.store.hasElection()).toThrow(/is closed/);
});
