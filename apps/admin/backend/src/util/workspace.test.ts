import { beforeEach, expect, test, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createWorkspace,
  createClientWorkspace,
  emptyWorkspaceData,
  clearRestoreState,
  getRestoreState,
  getRestoreStatePath,
  getWorkspaceControlPath,
  openWorkspaceStoreIfPresent,
  setRestoreState,
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

test('emptying a workspace removes its data and restore state but keeps its control files', async () => {
  const dir = makeTemporaryDirectory();
  {
    using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
    writeFileSync(join(dir, 'ballot-images', 'ballot.jpg'), 'image');
    expect(workspace).toBeDefined();
  }
  mkdirSync(getWorkspaceControlPath(dir));
  writeFileSync(join(getWorkspaceControlPath(dir), 'machine_mode'), 'client');
  setRestoreState(dir, 'running');

  await emptyWorkspaceData(dir);

  expect(readdirSync(dir)).toEqual([WORKSPACE_CONTROL_DIRECTORY_NAME]);
  expect(readdirSync(getWorkspaceControlPath(dir))).toEqual(['machine_mode']);
  expect(getRestoreState(dir)).toBeUndefined();
});

test('a workspace has no restore state until one is set', () => {
  const dir = makeTemporaryDirectory();
  expect(getRestoreState(dir)).toBeUndefined();
});

test.each(['scheduled', 'running'] as const)(
  'restore state round-trips through the control directory: %s',
  (state) => {
    const dir = makeTemporaryDirectory();

    setRestoreState(dir, state);

    expect(getRestoreState(dir)).toEqual(state);
    expect(readdirSync(getWorkspaceControlPath(dir))).toEqual([
      'restore_state',
    ]);
  }
);

test('clearing restore state takes the file away', () => {
  const dir = makeTemporaryDirectory();
  setRestoreState(dir, 'running');

  clearRestoreState(dir);

  expect(getRestoreState(dir)).toBeUndefined();
  expect(existsSync(getRestoreStatePath(dir))).toEqual(false);
});

test('surrounding whitespace does not change a restore state', () => {
  const dir = makeTemporaryDirectory();
  mkdirSync(getWorkspaceControlPath(dir));
  writeFileSync(getRestoreStatePath(dir), '  scheduled\n');

  expect(getRestoreState(dir)).toEqual('scheduled');
});

test('contents that are not a restore state mean none', () => {
  const dir = makeTemporaryDirectory();
  mkdirSync(getWorkspaceControlPath(dir));
  writeFileSync(getRestoreStatePath(dir), 'reboot');

  expect(getRestoreState(dir)).toBeUndefined();
});

test('reading restore state fails if the file is there but cannot be read', () => {
  const dir = makeTemporaryDirectory();
  mkdirSync(getRestoreStatePath(dir), { recursive: true });

  expect(() => getRestoreState(dir)).toThrow();
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
