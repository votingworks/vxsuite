import { dirSync } from 'tmp';
import { mockOf } from '@votingworks/test-utils';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

const initializeGetWorkspaceDiskSpaceSummaryMock = mockOf(
  initializeGetWorkspaceDiskSpaceSummary
);

test('workspace.reset rests the store', () => {
  const workspace = createWorkspace(
    dirSync().name,
    mockBaseLogger({ fn: jest.fn })
  );
  const fn = jest.fn();
  workspace.store.reset = fn;
  workspace.reset();
  expect(fn).toHaveBeenCalledTimes(1);
});

test('disk space tracking setup', () => {
  const dir = dirSync();
  const getWorkspaceDiskSpaceSummary = jest.fn();
  initializeGetWorkspaceDiskSpaceSummaryMock.mockReturnValueOnce(
    getWorkspaceDiskSpaceSummary
  );
  const workspace = createWorkspace(dir.name, mockBaseLogger({ fn: jest.fn }));
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledTimes(1);
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledWith(
    workspace.store,
    [workspace.path]
  );
  expect(workspace.getDiskSpaceSummary).toEqual(getWorkspaceDiskSpaceSummary);
});
