import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assert, deferred } from '@votingworks/basics';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import {
  attachUsbDrive,
  buildTestEnvironment,
  configureMachine,
  mockMachineLocked,
  mockSystemAdministratorAuth,
} from '../test/app.js';
import { mockDiskSpace } from '../test/backup.js';
import { copy } from './backup/create/copy_step.js';

vi.setConfig({ testTimeout: 30_000 });

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    getDiskSpaceSummaries: vi.fn(),
  })
);

vi.mock(
  import('./backup/create/copy_step.js'),
  async (
    importActual
  ): Promise<typeof import('./backup/create/copy_step.js')> => {
    const actual = await importActual();
    return { ...actual, copy: vi.fn(actual.copy) };
  }
);

const electionDefinition = readElectionGeneralDefinition();

let env: ReturnType<typeof buildTestEnvironment>;

beforeEach(() => {
  mockDiskSpace();
  env = buildTestEnvironment();
  mockSystemAdministratorAuth(env.auth);
});

afterEach(() => {
  env.peerServer.close();
});

async function attachBackupDrive(): Promise<string> {
  const { apiClient, usbPlatform } = env;
  await attachUsbDrive(
    { getUsbDriveStatus: () => apiClient.getBackupDriveStatus() },
    usbPlatform,
    undefined,
    'ext4'
  );
  const status = await apiClient.getBackupDriveStatus();
  assert(status.status === 'mounted', 'backup drive did not mount');
  return status.mountpoint;
}

function holdNextCopy(): {
  copyStarted: Promise<void>;
  finishCopy: () => void;
} {
  const copyStarted = deferred<void>();
  const copyMayFinish = deferred<void>();
  const realCopy = vi.mocked(copy).getMockImplementation()!;
  vi.mocked(copy).mockImplementationOnce(async (options) => {
    options.onProgressEvent?.({
      type: '4_copying_files',
      copiedCount: 0,
      totalCount: 2,
      copiedBytes: 0,
      totalBytes: 1024,
    });
    copyStarted.resolve();
    await copyMayFinish.promise;
    return realCopy(options);
  });
  return {
    copyStarted: copyStarted.promise,
    finishCopy: () => copyMayFinish.resolve(),
  };
}

async function waitForBackupToEnd() {
  const { apiClient } = env;
  await vi.waitFor(
    async () => {
      expect((await apiClient.getBackupStatus())?.status).toEqual('ended');
    },
    { timeout: 10_000 }
  );
  const status = await apiClient.getBackupStatus();
  assert(status?.status === 'ended');
  return status;
}

test('the backup drive is reported separately from the data drive', async () => {
  const { apiClient } = env;
  expect(await apiClient.getBackupDriveStatus()).toEqual({
    status: 'no_drive',
  });

  const mountpoint = await attachBackupDrive();
  expect(await apiClient.getBackupDriveStatus()).toEqual({
    status: 'mounted',
    mountpoint,
    fstype: 'ext4',
    availableBytes: expect.any(Number),
    totalBytes: expect.any(Number),
  });
  expect(await apiClient.getUsbDriveStatus()).toEqual({ status: 'no_drive' });
});

test('a backup is written to the backup drive and reported as it runs', async () => {
  const { apiClient, auth, logger } = env;
  await configureMachine(apiClient, auth, electionDefinition);
  const mountpoint = await attachBackupDrive();
  const { copyStarted, finishCopy } = holdNextCopy();

  expect(await env.apiClient.getBackupStatus()).toBeNull();
  await apiClient.startBackup();
  await copyStarted;
  expect(await apiClient.getBackupStatus()).toEqual({
    status: 'in-progress',
    lastProgressEvent: {
      type: '4_copying_files',
      copiedCount: 0,
      totalCount: 2,
      copiedBytes: 0,
      totalBytes: 1024,
    },
  });

  mockMachineLocked(auth);
  finishCopy();
  const status = await waitForBackupToEnd();
  const backupPath = join(
    mountpoint,
    'vxadmin-backups',
    generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.ballotHash
    )
  );
  expect(status.result.unsafeUnwrap().path).toEqual(backupPath);
  expect(existsSync(join(backupPath, 'manifest.json'))).toEqual(true);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BackupCreateComplete,
    'system_administrator',
    expect.objectContaining({ disposition: 'success' }),
    undefined
  );
});

test('a backup can be aborted while it runs', async () => {
  const { apiClient, auth } = env;
  await configureMachine(apiClient, auth, electionDefinition);
  const mountpoint = await attachBackupDrive();
  const { copyStarted, finishCopy } = holdNextCopy();

  await apiClient.startBackup();
  await copyStarted;
  await apiClient.abortBackup();
  finishCopy();

  const status = await waitForBackupToEnd();
  expect(status.result.err()).toEqual({
    type: 'cancelled',
    message: 'Backup cancelled',
  });
  expect(
    existsSync(
      join(
        mountpoint,
        'vxadmin-backups',
        generateElectionBasedSubfolderName(
          electionDefinition.election,
          electionDefinition.ballotHash
        )
      )
    )
  ).toEqual(false);
});

test('finishing a backup clears its status so another can start', async () => {
  const { apiClient, auth } = env;
  await configureMachine(apiClient, auth, electionDefinition);
  await attachBackupDrive();

  await apiClient.startBackup();
  await waitForBackupToEnd();
  await expect(apiClient.startBackup()).rejects.toThrow();

  await apiClient.finishBackup();
  expect(await apiClient.getBackupStatus()).toBeNull();

  await apiClient.startBackup();
  const status = await waitForBackupToEnd();
  status.result.unsafeUnwrap();
});
