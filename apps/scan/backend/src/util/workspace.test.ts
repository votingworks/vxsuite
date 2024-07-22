import * as tmp from 'tmp';
import { mockOf } from '@votingworks/test-utils';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { createWorkspace } from './workspace';
import { Store } from '../store';

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

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  const workspace = createWorkspace(dir.name);
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});

test('disk space tracking setup', () => {
  const dir = tmp.dirSync();
  const getWorkspaceDiskSpaceSummary = jest.fn();
  initializeGetWorkspaceDiskSpaceSummaryMock.mockReturnValueOnce(
    getWorkspaceDiskSpaceSummary
  );
  const workspace = createWorkspace(dir.name);
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledTimes(1);
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledWith(
    workspace.store,
    [workspace.path]
  );
  expect(workspace.getDiskSpaceSummary).toEqual(getWorkspaceDiskSpaceSummary);
});
