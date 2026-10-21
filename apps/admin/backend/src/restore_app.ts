import express, { type Application } from 'express';
import { basename } from 'node:path';
import * as grout from '@votingworks/grout';
import type { DippedSmartCardAuthApi } from '@votingworks/auth';
import type { DippedSmartCardAuth } from '@votingworks/types';
import { assert, ok, type Result } from '@votingworks/basics';
import { createSystemCallApi } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import {
  createUsbDriveAdapter,
  findDriveByPurpose,
  type MultiUsbDrive,
  type UsbDriveStatus,
} from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config.js';
import type { AppMode, BaseStore } from './types.js';
import { constructAuthMachineState, getUserRole } from './util/auth.js';
import { BackupRoot, type ListBackupsError } from './backup/backup_root.js';
import {
  startRestore,
  type RestoreController,
  type RestoreStatus,
} from './backup/restore/index.js';
import type { ReadBackupDetailsResult } from './backup/backup.js';
import type { BackupDetails } from './backup/backup_manifest.js';

/**
 * What restore mode presents to auth in place of a store: no election, so the
 * machine is unconfigured as far as who may log in. Nothing in restore mode
 * opens the workspace's database except the restore itself.
 */
export const RESTORE_MODE_STORE: BaseStore = {
  getAppMode: () => 'restore',
  getCurrentElectionId: () => undefined,
  // @coverage-exclude: asked about only when there is an election, and here
  // there never is
  getElectionKey: () => undefined,
  // @coverage-exclude: as above
  getSystemSettings: () => undefined,
};

/**
 * A backup listing on the inserted USB drive, with the result of reading its details.
 */
export interface BackupListing {
  name: string;
  path: string;
  detailsResult: ReadBackupDetailsResult;
}

/**
 * A backup that is available for restore, with its details.
 */
export interface AvailableBackup {
  name: string;
  path: string;
  details: BackupDetails;
}

function buildRestoreApi({
  auth,
  workspacePath,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspacePath: string;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}) {
  const backupDriveAdapter = createUsbDriveAdapter(multiUsbDrive, (drives) =>
    findDriveByPurpose(drives, 'backup')
  );

  let currentRestore: RestoreController | undefined;

  return grout.createApi({
    getMachineConfig,

    getAppMode(): AppMode {
      return RESTORE_MODE_STORE.getAppMode();
    },

    getAuthStatus(): Promise<DippedSmartCardAuth.AuthStatus> {
      return auth.getAuthStatus(constructAuthMachineState(RESTORE_MODE_STORE));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(
        constructAuthMachineState(RESTORE_MODE_STORE),
        input
      );
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(RESTORE_MODE_STORE));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(RESTORE_MODE_STORE),
        input
      );
    },

    getBackupDriveStatus(): Promise<UsbDriveStatus> {
      return backupDriveAdapter.status();
    },

    async listBackups(): Promise<Result<BackupListing[], ListBackupsError>> {
      const usbDriveStatus = await backupDriveAdapter.status();
      if (usbDriveStatus.status !== 'mounted') return ok([]);
      const backupRoot = new BackupRoot(usbDriveStatus.mountpoint);
      const backups = await backupRoot.listBackups();
      if (backups.isErr()) return backups;
      return ok(
        await Promise.all(
          backups.ok().map(async (backup) => ({
            name: basename(backup.path),
            path: backup.path,
            detailsResult: await backup.readDetails(),
          }))
        )
      );
    },

    async startRestore(input: { backupPath: string }): Promise<void> {
      assert(!currentRestore, 'Cannot start multiple restores at once');
      const backupDriveStatus = await backupDriveAdapter.status();
      assert(backupDriveStatus.status === 'mounted');
      const role = await getUserRole(auth, RESTORE_MODE_STORE);
      currentRestore = startRestore({
        backup: input.backupPath,
        workspacePath,
        // Capture the current user role since they may log out during the restore
        logger: Logger.from(logger, () => Promise.resolve(role)),
      });
    },

    getRestoreStatus(): RestoreStatus | null {
      return currentRestore?.status() ?? null;
    },

    abortRestore(): void {
      currentRestore?.abort();
    },

    finishRestore(): void {
      assert(currentRestore?.status().status === 'ended');
      currentRestore = undefined;
    },

    ...createSystemCallApi({
      usbDrive: backupDriveAdapter,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
      workspacePath,
      // @coverage-exclude
      getAuthStatus: () =>
        auth.getAuthStatus(constructAuthMachineState(RESTORE_MODE_STORE)),
    }),
  });
}

/**
 * The API a VxAdmin serves in restore mode, for the frontend to build a Grout
 * client from.
 */
export type RestoreApi = ReturnType<typeof buildRestoreApi>;

/**
 * Builds the express application for restore mode: a machine booted, on
 * request, to restore a backup into a workspace it is not otherwise serving.
 */
export function buildRestoreApp({
  auth,
  workspacePath,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspacePath: string;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}): Application {
  const app: Application = express();
  const api = buildRestoreApi({
    auth,
    workspacePath,
    logger,
    multiUsbDrive,
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
