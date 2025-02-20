import { expect, test, vi } from 'vitest';
import { dirSync } from 'tmp';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
}));

const initializeGetWorkspaceDiskSpaceSummaryMock = vi.mocked(
  initializeGetWorkspaceDiskSpaceSummary
);

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

test('disk space tracking setup', () => {
  const dir = dirSync();
  const getWorkspaceDiskSpaceSummary = vi.fn();
  initializeGetWorkspaceDiskSpaceSummaryMock.mockReturnValueOnce(
    getWorkspaceDiskSpaceSummary
  );
  const workspace = createWorkspace(dir.name, mockBaseLogger({ fn: vi.fn }));
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledTimes(1);
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledWith(
    workspace.store,
    [workspace.path]
  );
  expect(workspace.getDiskSpaceSummary).toEqual(getWorkspaceDiskSpaceSummary);
});
