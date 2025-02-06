import { expect, test, vi } from 'vitest';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { mockOf } from '@votingworks/test-utils';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
}));

const initializeGetWorkspaceDiskSpaceSummaryMock = mockOf(
  initializeGetWorkspaceDiskSpaceSummary
);

test('disk space tracking setup', () => {
  const dir = tmp.dirSync();
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
