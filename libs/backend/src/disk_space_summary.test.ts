import { mockOf } from '@votingworks/test-utils';
import { Client } from '@votingworks/db';
import { tmpNameSync } from 'tmp';
import { writeFileSync } from 'node:fs';
import {
  DiskSpaceSummary,
  SYSTEM_INFORMATION_DISK_SPACE_TABLE_SCHEMA,
  UsableDiskSpaceStore,
  getDiskSpaceSummary,
  getMaximumUsableDiskSpace,
  getWorkspaceDiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
  updateMaximumUsableDiskSpace,
} from './disk_space_summary';
import { execFile } from './exec';

jest.mock('./exec', (): typeof import('./exec') => ({
  ...jest.requireActual('./exec'),
  execFile: jest.fn(),
}));

const execFileMock = mockOf(execFile);

afterEach(() => {
  execFileMock.mockClear();
});

const EXAMPLE_STDOUT = `Filesystem             1K-blocks    Used Available Use% Mounted on
/dev/mapper/Vx--vx-tmp    940768      40    875604   1% /tmp
/dev/mapper/Vx--vg-var  91997880 4424092  82854584   6% /var
total                   92938648 4424132  83730188   6% -
`;

test('getDiskSpaceSummary', async () => {
  execFileMock.mockResolvedValue({
    stdout: EXAMPLE_STDOUT,
    stderr: '',
  });

  expect(await getDiskSpaceSummary(['/tmp', '/var'])).toEqual({
    total: 92938648,
    used: 4424132,
    available: 83730188,
  });
});

test('update and get maximum usable disk space', () => {
  const schemaPath = tmpNameSync();
  writeFileSync(schemaPath, SYSTEM_INFORMATION_DISK_SPACE_TABLE_SCHEMA);
  const client = Client.memoryClient(schemaPath);

  expect(getMaximumUsableDiskSpace(client)).toEqual(1); // default

  updateMaximumUsableDiskSpace(client, 100);
  expect(getMaximumUsableDiskSpace(client)).toEqual(100);
});

class MockUsableDiskSpaceStore implements UsableDiskSpaceStore {
  constructor(private readonly client: Client) {}

  getMaximumUsableDiskSpace(): number {
    return getMaximumUsableDiskSpace(this.client);
  }

  updateMaximumUsableDiskSpace(available: number): void {
    updateMaximumUsableDiskSpace(this.client, available);
  }
}

function mockDiskFreeOutput(summary: DiskSpaceSummary): void {
  const { total, used, available } = summary;
  const stdout = `Filesystem             1K-blocks    Used Available Use% Mounted on
/dev/mapper/Vx--vx-var    ${total}      ${used}    ${available}   1% /tmp
total                   ${total} ${used}  ${available}   1% -
`;

  execFileMock.mockResolvedValue({
    stdout,
    stderr: '',
  });
}

test('getWorkspaceDiskSpaceSummary', async () => {
  const schemaPath = tmpNameSync();
  writeFileSync(schemaPath, SYSTEM_INFORMATION_DISK_SPACE_TABLE_SCHEMA);
  const client = Client.memoryClient(schemaPath);
  const store = new MockUsableDiskSpaceStore(client);

  mockDiskFreeOutput({
    total: 100,
    used: 50,
    available: 50,
  });
  expect(await getWorkspaceDiskSpaceSummary(store, ['/var', '/tmp'])).toEqual({
    total: 50,
    used: 0,
    available: 50,
  });

  expect(execFileMock).toHaveBeenCalledWith('df', ['/var', '/tmp', '--total']);

  // disk space lowers, but the usable disk space we track stays the same
  mockDiskFreeOutput({
    total: 100,
    used: 60,
    available: 40,
  });
  expect(await getWorkspaceDiskSpaceSummary(store, ['/var', '/tmp'])).toEqual({
    total: 50,
    used: 10,
    available: 40,
  });

  // disk space increases (we don't expect this to happen in practice) and we
  // update our maximum
  mockDiskFreeOutput({
    total: 100,
    used: 40,
    available: 60,
  });
  expect(await getWorkspaceDiskSpaceSummary(store, ['/var', '/tmp'])).toEqual({
    total: 60,
    used: 0,
    available: 60,
  });
});

test('initializeGetWorkspaceDiskSpaceSummary', async () => {
  const schemaPath = tmpNameSync();
  writeFileSync(schemaPath, SYSTEM_INFORMATION_DISK_SPACE_TABLE_SCHEMA);
  const client = Client.memoryClient(schemaPath);
  const store = new MockUsableDiskSpaceStore(client);

  mockDiskFreeOutput({
    total: 100,
    used: 50,
    available: 50,
  });
  const getWorkspaceDiskSpaceSummaryFn = initializeGetWorkspaceDiskSpaceSummary(
    store,
    ['/var', '/tmp']
  );

  // disk space set up on initialize
  expect(execFileMock).toHaveBeenCalledWith('df', ['/var', '/tmp', '--total']);
  expect(await getWorkspaceDiskSpaceSummaryFn()).toEqual({
    total: 50,
    used: 0,
    available: 50,
  });
  expect(execFileMock).toHaveBeenCalledTimes(2);

  mockDiskFreeOutput({
    total: 100,
    used: 60,
    available: 40,
  });
  expect(await getWorkspaceDiskSpaceSummaryFn()).toEqual({
    total: 50,
    used: 10,
    available: 40,
  });
  expect(execFileMock).toHaveBeenCalledTimes(3);
});
