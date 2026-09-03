import express, { Application } from 'express';
import { basename, resolve } from 'node:path';
import * as grout from '@votingworks/grout';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { err, ok, Result } from '@votingworks/basics';
import { createSystemCallApi } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import {
  createUsbDriveAdapter,
  MultiUsbDrive,
  UsbDriveStatus,
} from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config.js';
import { isMultiStationAdjudicationEnabled } from './multi_station_config.js';
import { MachineModeController } from './machine_mode.js';
import { AppMode, BaseStore, MachineMode } from './types.js';
import { constructAuthMachineState } from './util/auth.js';
import { BackupRoot, ListBackupsError } from './backup/backup_root.js';
import { ProgressEvent } from './backup/progress.js';
import { restoreBackup } from './backup/restore/index.js';
import { RestoreError } from './backup/restore/types.js';

/**
 * What restore mode presents to auth in place of a store: no election, so the
 * machine is unconfigured as far as who may log in. Nothing in restore mode
 * opens the workspace's database except the restore itself.
 */
export const RESTORE_MODE_STORE: BaseStore = {
  getCurrentElectionId: () => undefined,
  // @coverage-exclude: asked about only when there is an election, and here
  // there never is
  getElectionKey: () => undefined,
  // @coverage-exclude: as above
  getSystemSettings: () => undefined,
};

/**
 * A backup on the inserted USB drive that may be restored.
 */
export interface AvailableBackup {
  name: string;
  path: string;
}

/**
 * Why the backups on the inserted USB drive could not be listed.
 */
export type ListAvailableBackupsError =
  | ListBackupsError
  | { type: 'no-usb-drive'; message: string };

/**
 * Where the restore stands. Progress arrives through this rather than through
 * the `restoreBackup` call, which returns only when the restore is over.
 */
export type RestoreStatus =
  | { state: 'idle' }
  | { state: 'restoring'; backupPath: string; progress?: ProgressEvent }
  | { state: 'restored'; backupPath: string }
  | { state: 'failed'; backupPath: string; error: RestoreError };

/**
 * Why the restore API refused or failed a restore: whatever the restore itself
 * reports, or that one is already running.
 */
export type RestoreModeError =
  | RestoreError
  | { type: 'restore-in-progress'; message: string };

function buildRestoreApi({
  auth,
  workspacePath,
  machineMode,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspacePath: string;
  machineMode: MachineModeController;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}) {
  const usbDriveAdapter = createUsbDriveAdapter(
    multiUsbDrive,
    // return the first FAT32 drive
    (drives) => drives.find((d) => d.partition?.fstype === 'fat32')?.diskPath
  );

  let status: RestoreStatus = { state: 'idle' };
  let abortController: AbortController | undefined;

  async function listAvailableBackups(): Promise<
    Result<AvailableBackup[], ListAvailableBackupsError>
  > {
    const usbDriveStatus = await usbDriveAdapter.status();
    if (usbDriveStatus.status !== 'mounted') {
      return err({
        type: 'no-usb-drive',
        message: 'No USB drive is inserted',
      });
    }

    const listResult = await new BackupRoot(
      usbDriveStatus.mountpoint
    ).listBackups();
    if (listResult.isErr()) {
      return listResult;
    }

    return ok(
      listResult
        .ok()
        .map((backup) => ({ name: basename(backup.path), path: backup.path }))
    );
  }

  return grout.createApi({
    getMachineConfig,

    getAppMode(): AppMode {
      return 'restore';
    },

    getMachineMode(): MachineMode {
      return machineMode.get();
    },

    isMultiStationAdjudicationEnabled(): boolean {
      return isMultiStationAdjudicationEnabled();
    },

    getAuthStatus() {
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

    getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDriveAdapter.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return await usbDriveAdapter.eject();
    },

    listAvailableBackups,

    getRestoreStatus(): RestoreStatus {
      return status;
    },

    /**
     * Restores one of the backups on the inserted USB drive into the
     * workspace. Resolves when the restore is over; poll `getRestoreStatus`
     * for progress in the meantime, and call `cancelRestore` to stop it. Once
     * a backup has been restored, rebooting is what puts it to use.
     */
    async restoreBackup(input: {
      backupPath: string;
    }): Promise<Result<void, RestoreModeError>> {
      if (status.state === 'restoring') {
        return err({
          type: 'restore-in-progress',
          message: 'Another restore is already replacing the workspace',
        });
      }

      const availableResult = await listAvailableBackups();
      if (availableResult.isErr()) {
        return err({
          type: 'backup-read-failed',
          message: availableResult.err().message,
        });
      }
      const backupPath = resolve(input.backupPath);
      if (!availableResult.ok().some((backup) => backup.path === backupPath)) {
        return err({
          type: 'backup-read-failed',
          message: `${input.backupPath} is not a backup on the inserted USB drive`,
        });
      }

      abortController = new AbortController();
      status = { state: 'restoring', backupPath };

      const result = await restoreBackup({
        backup: backupPath,
        workspacePath,
        logger,
        signal: abortController.signal,
        onProgressEvent: (progress) => {
          status = { state: 'restoring', backupPath, progress };
        },
      });

      abortController = undefined;
      status = result.isOk()
        ? { state: 'restored', backupPath }
        : { state: 'failed', backupPath, error: result.err() };
      return result;
    },

    cancelRestore(): void {
      abortController?.abort();
    },

    ...createSystemCallApi({
      usbDrive: usbDriveAdapter,
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
  machineMode,
  logger,
  multiUsbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspacePath: string;
  machineMode: MachineModeController;
  logger: Logger;
  multiUsbDrive: MultiUsbDrive;
}): Application {
  const app: Application = express();
  const api = buildRestoreApi({
    auth,
    workspacePath,
    machineMode,
    logger,
    multiUsbDrive,
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
