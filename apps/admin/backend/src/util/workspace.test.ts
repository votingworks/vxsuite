import * as tmp from 'tmp';
import { backendWaitFor, mockFunction } from '@votingworks/test-utils';
import { DiskSpaceSummary, getDiskSpaceSummary } from '@votingworks/backend';
import { createWorkspace } from './workspace';
import { Store } from '../store';

const mockDiskSpaceSummary: DiskSpaceSummary = {
  total: 100,
  used: 50,
  available: 50,
};
const getDiskSpaceSummaryMock = mockFunction<typeof getDiskSpaceSummary>(
  'getDiskSpaceSummary'
);

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    getDiskSpaceSummary: (paths: string[]) => getDiskSpaceSummaryMock(paths),
  })
);

beforeEach(() => {
  getDiskSpaceSummaryMock.reset();
});

afterEach(() => {
  getDiskSpaceSummaryMock.assertComplete();
});

test('createWorkspace', () => {
  const dir = tmp.dirSync();
  getDiskSpaceSummaryMock
    .expectCallWith([dir.name])
    .resolves(mockDiskSpaceSummary);
  const workspace = createWorkspace(dir.name);
  expect(workspace.path).toEqual(dir.name);
  expect(workspace.store).toBeInstanceOf(Store);
});

test('disk space tracking', async () => {
  const dir = tmp.dirSync();
  getDiskSpaceSummaryMock.expectCallWith([dir.name]).resolves({
    total: 10000,
    used: 1000,
    available: 9000,
  });
  const workspace = createWorkspace(dir.name);
  await backendWaitFor(() => {
    expect(workspace.store.getMaximumWorkspaceDiskSpace()).toEqual(9000);
  });

  getDiskSpaceSummaryMock.expectCallWith([dir.name]).resolves({
    total: 10000,
    used: 2000,
    available: 8000,
  });
  expect(await workspace.getDiskSpaceSummary()).toEqual({
    total: 9000,
    used: 1000,
    available: 8000,
  });

  getDiskSpaceSummaryMock.expectCallWith([dir.name]).resolves({
    total: 10000,
    used: 500,
    available: 9500,
  });
  expect(await workspace.getDiskSpaceSummary()).toEqual({
    total: 9500,
    used: 0,
    available: 9500,
  });
});
