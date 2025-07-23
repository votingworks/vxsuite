import { beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';
import { Store } from '../store';

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
});
