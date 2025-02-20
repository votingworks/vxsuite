import { beforeEach, expect, test, vi } from 'vitest';
import * as tmp from 'tmp';
import { initializeGetWorkspaceDiskSpaceSummary } from '@votingworks/backend';
import { mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './workspace';
import { Store } from '../store';

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    initializeGetWorkspaceDiskSpaceSummary: vi.fn(),
  })
);

beforeEach(() => {
  vi.clearAllMocks();
});

const initializeGetWorkspaceDiskSpaceSummaryMock = vi.mocked(
  initializeGetWorkspaceDiskSpaceSummary
);

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  const workspace = createWorkspace(dir.name, mockBaseLogger({ fn: vi.fn }));
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});

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
