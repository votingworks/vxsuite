import { beforeEach, expect, test, vi } from 'vitest';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createWorkspace,
  createClientWorkspace,
  emptyWorkspaceData,
  getRestoreInProgressMarkerPath,
  getWorkspaceControlPath,
  hasInterruptedRestore,
  openWorkspaceStoreIfPresent,
  WORKSPACE_CONTROL_DIRECTORY_NAME,
} from './workspace.js';
import { Store } from '../store.js';
import { ClientStore } from '../client_store.js';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
  })
);

beforeEach(() => {
  vi.clearAllMocks();
});

test('createWorkspace', () => {
  const dir = makeTemporaryDirectory();
  const workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir);
  expect(workspace.store).toBeInstanceOf(Store);
}, 30_000);

test('disposing a workspace closes its store', () => {
  const dir = makeTemporaryDirectory();
  let store: Store;

  {
    using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
    store = workspace.store;
    expect(store.getCurrentElectionId()).toBeUndefined();
  }

  expect(() => store.getCurrentElectionId()).toThrow('is closed');
}, 30_000);

test('createClientWorkspace', async () => {
  const dir = makeTemporaryDirectory();
  const workspace = createClientWorkspace(dir);
  expect(workspace.path).toEqual(dir);
  expect(workspace.clientStore).toBeInstanceOf(ClientStore);
  await expect(workspace.getDiskSpaceSummary()).resolves.toEqual(
    expect.objectContaining({ available: expect.any(Number) })
  );
});

test('emptying a workspace removes its data and marker but keeps its control files', async () => {
  const dir = makeTemporaryDirectory();
  {
    using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
    writeFileSync(join(dir, 'ballot-images', 'ballot.jpg'), 'image');
    expect(workspace).toBeDefined();
  }
  mkdirSync(getWorkspaceControlPath(dir));
  writeFileSync(join(getWorkspaceControlPath(dir), 'machine_mode'), 'client');
  writeFileSync(getRestoreInProgressMarkerPath(dir), '');

  await emptyWorkspaceData(dir);

  expect(readdirSync(dir)).toEqual([WORKSPACE_CONTROL_DIRECTORY_NAME]);
  expect(readdirSync(getWorkspaceControlPath(dir))).toEqual(['machine_mode']);
  expect(hasInterruptedRestore(dir)).toEqual(false);
});

test('emptying a workspace that has no control directory leaves it empty', async () => {
  const dir = makeTemporaryDirectory();
  writeFileSync(join(dir, 'data.db'), 'stale');

  await emptyWorkspaceData(dir);

  expect(readdirSync(dir)).toEqual([]);
});

test('opening a store only if present creates nothing where there is none', () => {
  const dir = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });

  expect(openWorkspaceStoreIfPresent(dir, logger)).toBeUndefined();
  expect(readdirSync(dir)).toEqual([]);

  {
    using workspace = createWorkspace(dir, logger);
    expect(workspace.store.getCurrentElectionId()).toBeUndefined();
  }

  using store = openWorkspaceStoreIfPresent(dir, logger);
  expect(store).toBeInstanceOf(Store);
});
