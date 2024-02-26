import { mockOf } from '@votingworks/test-utils';
import {
  DiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
} from '@votingworks/backend';
import { withApp } from '../test/helpers/setup_app';

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

beforeEach(() => {
  mockOf(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );
});

test('getDiskSpaceSummary', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
      MOCK_DISK_SPACE_SUMMARY
    );
  });
});
