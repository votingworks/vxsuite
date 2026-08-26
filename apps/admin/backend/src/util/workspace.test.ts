import { beforeEach, expect, test, vi } from 'vitest';
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createWorkspace,
  createClientWorkspace,
  openWorkspace,
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

/**
 * Moves a path from inside the content directory back to the workspace root,
 * i.e. undoes the migration for one entry.
 */
function renameToRoot(root: string, path: string): void {
  renameSync(path, join(root, basename(path)));
}

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

test('a workspace reports its disk space', async () => {
  const dir = makeTemporaryDirectory();
  using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));

  await expect(workspace.getDiskSpaceSummary()).resolves.toEqual(
    expect.objectContaining({ available: expect.any(Number) })
  );
}, 30_000);

test('a workspace keeps its content out of its root', () => {
  const dir = makeTemporaryDirectory();
  using workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));

  expect(workspace.store.getDbPath()).toEqual(workspace.layout.dbPath);
  expect(readdirSync(dir)).toEqual(['current']);
}, 30_000);

test('opening a workspace migrates it off the old flat layout', () => {
  const dir = makeTemporaryDirectory();

  // A workspace as it exists on a machine that has not been upgraded yet:
  // written flat, by software that had never heard of a content directory.
  {
    using flat = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
    for (const path of [
      flat.layout.dbPath,
      flat.layout.ballotImagesPath,
      flat.layout.electionPackagesPath,
    ]) {
      renameToRoot(dir, path);
    }
    rmSync(flat.layout.contentPath, { recursive: true });
  }

  using workspace = openWorkspace(dir, mockBaseLogger({ fn: vi.fn }));

  expect(existsSync(workspace.layout.dbPath)).toEqual(true);
  expect(workspace.store.getCurrentElectionId()).toBeUndefined();
  expect(readdirSync(dir)).toEqual(['current']);
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
