import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import makeDebug from 'debug';
import { assert, sleep } from '@votingworks/basics';
import { BaseLogger } from '@votingworks/logging';
import { MultiUsbDrive, isExt4Partition } from '@votingworks/usb-drive';

import {
  BackupDriveInfo,
  BackupEntry,
  BackupOperationStatus,
  BackupProgress,
  BackupTrigger,
  BACKUP_ROOT_DIR,
  RestoreProgress,
  BackupManifest,
} from './types';
import { performBackup, listBackups as listBackupsFromDrive } from './backup';
import { performRestore } from './restore';

const debug = makeDebug('admin:backup-manager');

/**
 * Manages backup operations, state, and coordination with USB drives.
 * This is the single source of truth for backup status in the backend.
 *
 * Drive info and backup lists are cached in memory and refreshed when
 * the drive set changes (via {@link refreshDriveCache}). API callers
 * never touch the filesystem directly — they read from the cache. This
 * prevents open file handles from keeping the filesystem busy and
 * blocking eject/unmount.
 */
export class BackupManager {
  private status: BackupOperationStatus = { type: 'idle' };
  private abortController = new AbortController();
  private statusListeners: Array<() => void> = [];

  private cachedDrives: BackupDriveInfo[] = [];
  private cachedBackups = new Map<string, BackupEntry[]>();

  constructor(
    private readonly getWorkspacePath: () => string,
    private readonly getDbPath: () => string,
    private readonly getBallotImagesPath: () => string,
    private readonly backupDatabase: (destPath: string) => void,
    private readonly logger: BaseLogger,
    private readonly multiUsbDrive: MultiUsbDrive
  ) {
    // Populate cache on construction
    this.refreshDriveCache();
  }

  /**
   * Re-scan drives and update the in-memory cache. Call this whenever
   * the set of connected drives changes (e.g. from the MultiUsbDrive
   * onChange callback).
   */
  refreshDriveCache(): void {
    const drives = this.multiUsbDrive.getDrives();
    const result: BackupDriveInfo[] = [];
    const newBackups = new Map<string, BackupEntry[]>();

    for (const drive of drives) {
      for (const partition of drive.partitions) {
        if (!isExt4Partition(partition)) continue;
        if (partition.mount.type !== 'mounted') continue;

        const { mountPoint } = partition.mount;
        const backupRootPath = join(mountPoint, BACKUP_ROOT_DIR);
        const isBackupDrive = existsSync(backupRootPath);

        result.push({
          driveDevPath: drive.devPath,
          partitionDevPath: partition.devPath,
          mountPoint,
          vendor: drive.vendor,
          model: drive.model,
          label: partition.label,
          isBackupDrive,
        });

        if (isBackupDrive) {
          newBackups.set(mountPoint, listBackupsFromDrive(mountPoint));
        }
      }
    }

    this.cachedDrives = result;
    this.cachedBackups = newBackups;
  }

  getStatus(): BackupOperationStatus {
    return this.status;
  }

  onStatusChange(listener: () => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private setStatus(status: BackupOperationStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener();
    }
  }

  /**
   * Returns backup drive info. Automatically refreshes the cache if the
   * underlying USB drive state has changed (checked via the MultiUsbDrive's
   * in-memory drive list, which doesn't touch the filesystem).
   */
  getBackupDrives(): BackupDriveInfo[] {
    this.refreshDriveCacheIfStale();
    return this.cachedDrives;
  }

  /**
   * Compares the current MultiUsbDrive state against the cached state and
   * refreshes if the set of mounted ext4 partitions has changed.
   */
  private refreshDriveCacheIfStale(): void {
    const drives = this.multiUsbDrive.getDrives();
    const currentMounts = new Set<string>();
    for (const drive of drives) {
      for (const partition of drive.partitions) {
        if (!isExt4Partition(partition)) continue;
        if (partition.mount.type !== 'mounted') continue;
        currentMounts.add(partition.mount.mountPoint);
      }
    }
    const cachedMounts = new Set(
      this.cachedDrives.filter((d) => d.mountPoint).map((d) => d.mountPoint)
    );

    const sameSize = currentMounts.size === cachedMounts.size;
    const sameContents =
      sameSize && [...currentMounts].every((m) => cachedMounts.has(m));

    if (!sameContents) {
      debug('drive state changed, refreshing cache');
      this.refreshDriveCache();
    }
  }

  /**
   * Designate an ext4-formatted drive as a backup drive by creating
   * the vxadmin-backups directory on it.
   */
  async designateBackupDrive(driveDevPath: string): Promise<void> {
    // First format as ext4 if not already
    const drives = this.multiUsbDrive.getDrives();
    const drive = drives.find((d) => d.devPath === driveDevPath);
    assert(drive, `Drive not found: ${driveDevPath}`);

    const ext4Partition = drive.partitions.find(
      (p) => isExt4Partition(p) && p.mount.type === 'mounted'
    );

    if (!ext4Partition) {
      // Format as ext4 first
      debug('formatting drive %s as ext4', driveDevPath);
      await this.multiUsbDrive.formatDrive(driveDevPath, 'ext4');

      const mountPoint = await this.waitForMount(driveDevPath);
      mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });
      debug('created backup root directory on %s', mountPoint);
      this.refreshDriveCache();
      return;
    }

    assert(ext4Partition.mount.type === 'mounted');
    const { mountPoint } = ext4Partition.mount;
    try {
      mkdirSync(join(mountPoint, BACKUP_ROOT_DIR), { recursive: true });
      debug('created backup root directory on %s', mountPoint);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        // Likely a drive formatted elsewhere with root-owned dirs (e.g.
        // lost+found). Reformat it since the user already confirmed they
        // don't need the data.
        debug(
          'EACCES creating backup dir, reformatting drive %s',
          driveDevPath
        );
        await this.multiUsbDrive.formatDrive(driveDevPath, 'ext4');
        const newMountPoint = await this.waitForMount(driveDevPath);
        mkdirSync(join(newMountPoint, BACKUP_ROOT_DIR), { recursive: true });
        debug(
          'created backup root directory after reformat on %s',
          newMountPoint
        );
      } else {
        throw error;
      }
    }
    this.refreshDriveCache();
  }

  private async waitForMount(driveDevPath: string): Promise<string> {
    const TIMEOUT_MS = 10_000;
    const deadline = Date.now() + TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.multiUsbDrive.refresh();
      const drive = this.multiUsbDrive
        .getDrives()
        .find((d) => d.devPath === driveDevPath);
      const mounted = drive?.partitions.find(
        (p) => isExt4Partition(p) && p.mount.type === 'mounted'
      );
      if (mounted?.mount.type === 'mounted') {
        return mounted.mount.mountPoint;
      }

      await Promise.race([
        this.multiUsbDrive.waitForChange(),
        sleep(deadline - Date.now()),
      ]);
    }

    throw new Error('Drive did not mount after formatting');
  }

  /**
   * Returns cached backup list for a drive. Does not touch the filesystem.
   * Call {@link refreshDriveCache} to update.
   */
  listBackups(mountPoint: string): BackupEntry[] {
    return this.cachedBackups.get(mountPoint) ?? [];
  }

  /**
   * Start a backup operation. Returns immediately; backup runs in background.
   */
  async startBackup(
    trigger: BackupTrigger,
    backupDriveMountPoint: string,
    electionId: string,
    electionTitle: string,
    electionDate: string,
    electionDirName: string,
    machineId: string,
    softwareVersion: string
  ): Promise<void> {
    if (this.status.type === 'running') {
      throw new Error('A backup is already in progress');
    }

    this.abortController = new AbortController();
    const startedAt = new Date().toISOString();

    this.setStatus({
      type: 'running',
      trigger,
      startedAt,
      progress: {
        phase: 'preflight',
        imagesTotal: 0,
        imagesCopied: 0,
      },
    });

    try {
      await performBackup({
        workspacePath: this.getWorkspacePath(),
        dbPath: this.getDbPath(),
        ballotImagesPath: this.getBallotImagesPath(),
        backupDriveMountPoint,
        electionId,
        electionTitle,
        electionDate,
        electionDirName,
        machineId,
        softwareVersion,
        logger: this.logger,
        backupDatabase: this.backupDatabase,
        onProgress: (progress: BackupProgress) => {
          if (this.status.type === 'running') {
            this.setStatus({
              ...this.status,
              progress,
            });
          }
        },
        signal: this.abortController.signal,
      });

      this.refreshDriveCache();

      this.setStatus({
        type: 'success',
        trigger,
        completedAt: new Date().toISOString(),
      });

      debug('backup completed successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage === 'Backup was cancelled') {
        this.setStatus({ type: 'idle' });
        debug('backup cancelled');
      } else {
        this.setStatus({
          type: 'error',
          trigger,
          error: errorMessage,
          failedAt: new Date().toISOString(),
        });
        debug('backup failed: %s', errorMessage);
      }
    }
  }

  /**
   * Cancel a running backup.
   */
  cancelBackup(): void {
    if (this.status.type === 'running') {
      this.abortController.abort();
    }
  }

  /**
   * Restore from a backup. This is a blocking operation.
   */
  async restore(
    backupDriveMountPoint: string,
    backupDirectoryName: string,
    softwareVersion: string,
    onProgress?: (progress: RestoreProgress) => void
  ): Promise<BackupManifest> {
    return performRestore({
      workspacePath: this.getWorkspacePath(),
      dbPath: this.getDbPath(),
      ballotImagesPath: this.getBallotImagesPath(),
      backupDriveMountPoint,
      backupDirectoryName,
      softwareVersion,
      logger: this.logger,
      onProgress,
    });
  }
}
