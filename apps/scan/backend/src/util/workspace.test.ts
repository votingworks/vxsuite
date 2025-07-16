import { beforeEach, expect, test, vi } from 'vitest';
import * as tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';
import { Store } from '../store';

beforeEach(() => {
  vi.clearAllMocks();
});

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  const workspace = createWorkspace(dir.name, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});
