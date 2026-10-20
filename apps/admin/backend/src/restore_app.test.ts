import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import {
  buildMockDippedSmartCardAuth,
  DEV_JURISDICTION,
  type DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, deferred, err, ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import { DEFAULT_SYSTEM_SETTINGS, DEV_MACHINE_ID } from '@votingworks/types';
import {
  detectMultiUsbDrive,
  SimulatedUsbPlatform,
} from '@votingworks/usb-drive';
import {
  attachUsbDrive,
  buildMockLogger,
  mockMachineLocked,
  mockSystemAdministratorAuth,
} from '../test/app.js';
import { makeBackup, mockDiskSpace } from '../test/backup.js';
import { copyBackupFiles } from './backup/restore/copy_step.js';
import type { RestoreStatus } from './backup/restore/index.js';
import {
  buildRestoreApp,
  type RestoreApi,
  RESTORE_MODE_STORE,
} from './restore_app.js';
import {
  ADMIN_WORKSPACE_DATABASE_NAME,
  openWorkspace,
} from './util/workspace.js';

vi.setConfig({ testTimeout: 30_000 });

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    getDiskSpaceSummaries: vi.fn(),
  })
);

vi.mock(
  import('./backup/restore/copy_step.js'),
  async (
    importActual
  ): Promise<typeof import('./backup/restore/copy_step.js')> => {
    const actual = await importActual();
    return { ...actual, copyBackupFiles: vi.fn(actual.copyBackupFiles) };
  }
);

function buildRestoreTestEnvironment() {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspacePath = makeTemporaryDirectory();
  const logger = buildMockLogger(auth, RESTORE_MODE_STORE);
  const usbPlatform = new SimulatedUsbPlatform(makeTemporaryDirectory());
  const multiUsbDrive = detectMultiUsbDrive({ logger, platform: usbPlatform });
  const app = buildRestoreApp({
    auth,
    workspacePath,
    logger,
    multiUsbDrive,
  });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<RestoreApi>({
    baseUrl: `http://localhost:${port}/api`,
  });
  const backupDriveClient: Parameters<typeof attachUsbDrive>[0] = {
    getUsbDriveStatus: () => apiClient.getBackupDriveStatus(),
  };

  mockSystemAdministratorAuth(auth);

  return {
    auth,
    workspacePath,
    logger,
    apiClient,
    backupDriveClient,
    server,
    usbPlatform,
  };
}

let env: ReturnType<typeof buildRestoreTestEnvironment>;

beforeEach(() => {
  mockDiskSpace();
  env = buildRestoreTestEnvironment();
});

afterEach(() => {
  env.server.close();
  vi.restoreAllMocks();
});

/**
 * Attaches a USB drive holding `backup`, as a backup drive would, and returns
 * the backup's path on the mounted drive.
 */
async function insertBackupDrive(
  backup: { path: string },
  {
    apiClient,
    backupDriveClient,
    usbPlatform,
  }: ReturnType<typeof buildRestoreTestEnvironment>
): Promise<string> {
  // A backup lives at `<root>/vxadmin-backups/<name>`; the drive gets the root.
  await attachUsbDrive(
    backupDriveClient,
    usbPlatform,
    dirname(dirname(backup.path)),
    'ext4'
  );
  const listed = (await apiClient.listBackups()).unsafeUnwrap();
  expect(listed).toHaveLength(1);
  expect(listed[0]!.manifestResult.unsafeUnwrap()).toMatchObject({
    version: 1,
    machineId: DEV_MACHINE_ID,
    cvrCount: 1,
  });
  return listed[0]!.path;
}

function holdNextCopy() {
  const copyStarted = deferred<void>();
  const copyMayFinish = deferred<void>();
  const realCopy = vi.mocked(copyBackupFiles).getMockImplementation()!;
  vi.mocked(copyBackupFiles).mockImplementationOnce(async (options) => {
    options.onProgressEvent?.({
      type: '2_copying_files',
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

async function waitForRestoreToEnd(
  apiClient: grout.Client<RestoreApi>
): Promise<Extract<RestoreStatus, { status: 'ended' }>> {
  return await vi.waitFor(
    async () => {
      const status = await apiClient.getRestoreStatus();
      assert(status?.status === 'ended');
      return status;
    },
    { timeout: 10_000 }
  );
}

test('describes itself as restore mode', async () => {
  const { apiClient } = env;

  expect(await apiClient.getAppMode()).toEqual('restore');
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
  expect(await apiClient.getRestoreStatus()).toBeNull();
});

test('auth runs against an unconfigured machine', async () => {
  const { apiClient, auth } = env;

  expect((await apiClient.getAuthStatus()).status).toEqual('logged_in');

  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();
  const sessionExpiresAt = new Date();
  await apiClient.updateSessionExpiry({ sessionExpiresAt });

  const unconfigured: DippedSmartCardAuthMachineState = {
    ...DEFAULT_SYSTEM_SETTINGS.auth,
    allowedUserRoles: ['vendor', 'system_administrator'],
    jurisdiction: DEV_JURISDICTION,
    machineType: 'admin',
    isConfigured: false,
  };
  expect(auth.checkPin).toHaveBeenCalledWith(unconfigured, { pin: '123456' });
  expect(auth.logOut).toHaveBeenCalledWith(unconfigured);
  expect(auth.updateSessionExpiry).toHaveBeenCalledWith(unconfigured, {
    sessionExpiresAt,
  });
});

test('has no backups to offer without a USB drive', async () => {
  const { apiClient } = env;

  expect(await apiClient.getBackupDriveStatus()).toEqual({
    status: 'no_drive',
  });
  expect((await apiClient.listBackups()).unsafeUnwrap()).toEqual([]);
});

test('restores a backup from the inserted USB drive and reports it as it runs', async () => {
  const { apiClient, auth, workspacePath, logger } = env;
  const backup = await makeBackup();
  const backupPath = await insertBackupDrive(backup, env);
  const { copyStarted, finishCopy } = holdNextCopy();

  // Restore mode has opened nothing in the workspace.
  expect(
    existsSync(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).toEqual(false);
  expect(await apiClient.getRestoreStatus()).toBeNull();

  await apiClient.startRestore({ backupPath });
  await copyStarted;
  expect(await apiClient.getRestoreStatus()).toEqual({
    status: 'in-progress',
    lastProgressEvent: {
      type: '2_copying_files',
      copiedCount: 0,
      totalCount: 2,
      copiedBytes: 0,
      totalBytes: 1024,
    },
  });
  await expect(apiClient.startRestore({ backupPath })).rejects.toThrow();
  await expect(apiClient.finishRestore()).rejects.toThrow();

  mockMachineLocked(auth);
  finishCopy();
  const status = await waitForRestoreToEnd(apiClient);
  expect(status.result).toEqual(ok());
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.BackupRestoreComplete,
    'system_administrator',
    expect.objectContaining({ disposition: 'success' }),
    undefined
  );

  // The workspace holds the backup; the machine that reads it is the one that
  // starts after a reboot.
  using restored = openWorkspace(workspacePath, logger);
  expect(restored.store.getCurrentElectionId()).toBeDefined();
});

test('a restore can be cancelled, and finishing it makes way for another', async () => {
  const { apiClient, workspacePath } = env;
  const backup = await makeBackup();
  const backupPath = await insertBackupDrive(backup, env);
  const { copyStarted, finishCopy } = holdNextCopy();

  await apiClient.startRestore({ backupPath });
  await copyStarted;
  await apiClient.abortRestore();
  finishCopy();
  const status = await waitForRestoreToEnd(apiClient);
  expect(status.result).toEqual(
    err({ type: 'canceled', message: 'Restore canceled' })
  );
  expect(
    existsSync(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).toEqual(false);

  // Cancelling with nothing running is a no-op.
  await apiClient.abortRestore();
  expect(await apiClient.getRestoreStatus()).toEqual(status);

  await apiClient.finishRestore();
  expect(await apiClient.getRestoreStatus()).toBeNull();

  await apiClient.startRestore({ backupPath });
  expect((await waitForRestoreToEnd(apiClient)).result).toEqual(ok());
});

test('passes on a drive whose backups directory is something else', async () => {
  const { apiClient, backupDriveClient, usbPlatform } = env;
  await attachUsbDrive(
    backupDriveClient,
    usbPlatform,
    { 'vxadmin-backups': Buffer.from('not a directory') },
    'ext4'
  );

  expect((await apiClient.listBackups()).err()).toMatchObject({
    type: 'not-directory',
  });
});

test('lists a backup whose manifest cannot be read alongside the rest', async () => {
  const { apiClient } = env;
  const backupPath = await insertBackupDrive(await makeBackup(), env);
  const unreadablePath = join(dirname(backupPath), 'unreadable');
  mkdirSync(unreadablePath);

  const listed = (await apiClient.listBackups()).unsafeUnwrap();
  expect(listed.map((backup) => backup.path).sort()).toEqual(
    [backupPath, unreadablePath].sort()
  );
  expect(
    listed.find((backup) => backup.path === backupPath)?.manifestResult.isOk()
  ).toEqual(true);
  expect(
    listed
      .find((backup) => backup.path === unreadablePath)
      ?.manifestResult.err()
  ).toMatchObject({ type: 'read-failed' });
});
