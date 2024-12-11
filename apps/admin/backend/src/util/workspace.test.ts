import { expect, test, vi } from 'vitest';
import * as tmp from 'tmp';
import { mockOf } from '@votingworks/test-utils';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';
import { Store } from '../store';

vi.mock('@votingworks/backend', async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual<typeof import('@votingworks/backend')>()),
    initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
  }));

const initializeGetWorkspaceDiskSpaceSummaryMock = mockOf(
  initializeGetWorkspaceDiskSpaceSummary
);

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  const workspace = createWorkspace(dir.name, mockBaseLogger());
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});

test('disk space tracking setup', () => {
  const dir = tmp.dirSync();
  const getWorkspaceDiskSpaceSummary = vi.fn();
  initializeGetWorkspaceDiskSpaceSummaryMock.mockReturnValueOnce(
    getWorkspaceDiskSpaceSummary
  );
  const workspace = createWorkspace(dir.name, mockBaseLogger());
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledTimes(1);
  expect(initializeGetWorkspaceDiskSpaceSummaryMock).toHaveBeenCalledWith(
    workspace.store,
    [workspace.path]
  );
  expect(workspace.getDiskSpaceSummary).toEqual(getWorkspaceDiskSpaceSummary);
});
