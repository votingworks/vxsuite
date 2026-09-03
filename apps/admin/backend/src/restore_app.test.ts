import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { deferred, err, ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import { DEV_MACHINE_ID } from '@votingworks/types';
import {
  detectMultiUsbDrive,
  SimulatedUsbPlatform,
} from '@votingworks/usb-drive';
import {
  attachUsbDrive,
  buildMockLogger,
  mockSystemAdministratorAuth,
} from '../test/app.js';
import { makeBackup, mockDiskSpace } from '../test/backup.js';
import { restoreBackup } from './backup/restore/index.js';
import { FileBackedMachineModeController } from './machine_mode.js';
import {
  buildRestoreApp,
  RestoreApi,
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
  import('./backup/restore/index.js'),
  async (importActual): Promise<typeof import('./backup/restore/index.js')> => {
    const actual = await importActual();
    return { ...actual, restoreBackup: vi.fn(actual.restoreBackup) };
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
    machineMode: FileBackedMachineModeController.forWorkspace(workspacePath),
  });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<RestoreApi>({
    baseUrl: `http://localhost:${port}/api`,
  });

  mockSystemAdministratorAuth(auth);

  return { auth, workspacePath, logger, apiClient, server, usbPlatform };
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
  apiClient: grout.Client<RestoreApi>,
  usbPlatform: SimulatedUsbPlatform
): Promise<string> {
  // A backup lives at `<root>/vxadmin-backups/<name>`; the drive gets the root.
  await attachUsbDrive(apiClient, usbPlatform, dirname(dirname(backup.path)));
  const listed = (await apiClient.listAvailableBackups()).unsafeUnwrap();
  expect(listed).toEqual([
    { name: basename(backup.path), path: expect.any(String) },
  ]);
  return listed[0]!.path;
}

test('describes itself as restore mode', async () => {
  const { apiClient } = env;

  expect(await apiClient.getAppMode()).toEqual('restore');
  expect(await apiClient.getMachineMode()).toEqual('host');
  expect(await apiClient.isMultiStationAdjudicationEnabled()).toEqual(false);
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
  expect(await apiClient.getRestoreStatus()).toEqual({ state: 'idle' });
});

test('auth runs against an unconfigured machine', async () => {
  const { apiClient, auth } = env;

  expect((await apiClient.getAuthStatus()).status).toEqual('logged_in');

  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();
  const sessionExpiresAt = new Date();
  await apiClient.updateSessionExpiry({ sessionExpiresAt });

  const unconfigured = expect.objectContaining({ isConfigured: false });
  expect(auth.checkPin).toHaveBeenCalledWith(unconfigured, { pin: '123456' });
  expect(auth.logOut).toHaveBeenCalledWith(unconfigured);
  expect(auth.updateSessionExpiry).toHaveBeenCalledWith(unconfigured, {
    sessionExpiresAt,
  });
});

test('has no backups to offer without a USB drive', async () => {
  const { apiClient } = env;

  expect(await apiClient.getUsbDriveStatus()).toEqual({ status: 'no_drive' });
  expect((await apiClient.listAvailableBackups()).err()).toEqual({
    type: 'no-usb-drive',
    message: 'No USB drive is inserted',
  });
  expect(
    (await apiClient.restoreBackup({ backupPath: '/nowhere' })).err()
  ).toMatchObject({
    type: 'backup-read-failed',
    message: 'No USB drive is inserted',
  });
});

test('restores a backup from the inserted USB drive', async () => {
  const { apiClient, workspacePath, usbPlatform, logger } = env;
  const backup = await makeBackup();
  const backupPath = await insertBackupDrive(backup, apiClient, usbPlatform);

  // Restore mode has opened nothing in the workspace.
  expect(
    existsSync(join(workspacePath, ADMIN_WORKSPACE_DATABASE_NAME))
  ).toEqual(false);

  expect(await apiClient.restoreBackup({ backupPath })).toEqual(ok());
  expect(await apiClient.getRestoreStatus()).toEqual({
    state: 'restored',
    backupPath,
  });

  // The workspace holds the backup; the machine that reads it is the one that
  // starts after a reboot.
  using restored = openWorkspace(workspacePath, logger);
  expect(restored.store.getCurrentElectionId()).toBeDefined();

  await apiClient.ejectUsbDrive();
  expect((await apiClient.getUsbDriveStatus()).status).toEqual('ejected');
});

test('restores only a backup that is on the inserted USB drive', async () => {
  const { apiClient, usbPlatform } = env;
  const backup = await makeBackup();
  await insertBackupDrive(backup, apiClient, usbPlatform);

  // The same backup, but where it was made rather than on the drive.
  expect(
    (await apiClient.restoreBackup({ backupPath: backup.path })).err()
  ).toMatchObject({
    type: 'backup-read-failed',
    message: expect.stringContaining('not a backup on the inserted USB drive'),
  });
  expect(await apiClient.getRestoreStatus()).toEqual({ state: 'idle' });
});

test('reports progress, refuses a second restore, and can be cancelled', async () => {
  const { apiClient, usbPlatform } = env;
  const backup = await makeBackup();
  const backupPath = await insertBackupDrive(backup, apiClient, usbPlatform);

  // Holds the restore at a point of our choosing, so that what the API does
  // while one is running can be observed.
  const restoreHeld = deferred<void>();
  const restoreFinished = deferred<void>();
  vi.mocked(restoreBackup).mockImplementationOnce(async (options) => {
    options.onProgressEvent?.({ type: 'preparing' });
    restoreHeld.resolve();
    await restoreFinished.promise;
    return options.signal?.aborted
      ? err({ type: 'cancelled', message: 'Restore cancelled' })
      : ok();
  });

  const restorePromise = apiClient.restoreBackup({ backupPath });
  await restoreHeld.promise;

  expect(await apiClient.getRestoreStatus()).toEqual({
    state: 'restoring',
    backupPath,
    progress: { type: 'preparing' },
  });
  expect((await apiClient.restoreBackup({ backupPath })).err()).toEqual({
    type: 'restore-in-progress',
    message: 'Another restore is already replacing the workspace',
  });

  await apiClient.cancelRestore();
  restoreFinished.resolve();

  expect((await restorePromise).err()).toEqual({
    type: 'cancelled',
    message: 'Restore cancelled',
  });
  expect(await apiClient.getRestoreStatus()).toEqual({
    state: 'failed',
    backupPath,
    error: { type: 'cancelled', message: 'Restore cancelled' },
  });

  // Cancelling with nothing running is a no-op.
  await apiClient.cancelRestore();
});

test('passes on a drive whose backups directory is something else', async () => {
  const { apiClient, usbPlatform } = env;
  await attachUsbDrive(apiClient, usbPlatform, {
    'vxadmin-backups': Buffer.from('not a directory'),
  });

  expect((await apiClient.listAvailableBackups()).err()).toMatchObject({
    type: 'not-directory',
  });
  expect(
    (await apiClient.restoreBackup({ backupPath: '/nowhere' })).err()
  ).toMatchObject({
    type: 'backup-read-failed',
    message: expect.stringContaining('is not a directory'),
  });
});
