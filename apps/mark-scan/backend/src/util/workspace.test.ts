import { expect, test, vi } from 'vitest';
import { dirSync } from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
}));

test('workspace.reset rests the store', () => {
  const workspace = createWorkspace(
    dirSync().name,
    mockBaseLogger({ fn: vi.fn })
  );
  const fn = vi.fn();
  workspace.store.reset = fn;
  workspace.reset();
  expect(fn).toHaveBeenCalledTimes(1);
});
