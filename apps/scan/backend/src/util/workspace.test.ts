import { beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace.js';
import { Store } from '../store.js';

beforeEach(() => {
  vi.clearAllMocks();
});

test('createWorkspace', () => {
  const dir = makeTemporaryDirectory();
  const workspace = createWorkspace(dir, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir);
  expect(workspace.store).toBeInstanceOf(Store);
});
