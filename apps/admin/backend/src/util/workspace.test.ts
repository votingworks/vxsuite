import { beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace, createClientWorkspace } from './workspace.js';
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
