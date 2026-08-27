import { Id } from '@votingworks/types';
import { BackupStagingArea } from '../staging_area.js';
import { Store } from '../../store.js';
import { BackupManifest } from '../backup_manifest.js';
import { Workspace } from '../../util/workspace.js';
import { ProgressTracking } from '../progress.js';

/**
 * Options for preparing a backup to copy from the given workspace to a target.
 */
export interface PrepareBackupOptions extends ProgressTracking {
  /**
   * The workspace to back up with an already-open client for the database.
   * Using the same database as the running app means backups do not get
   * restarted out from under us whenever a write occurs. If writes come in from
   * other connections then the backup will be restarted.
   */
  workspace: Workspace;

  /**
   * Directory path of the root location containing all election backups.
   * Typically a USB drive's mount point.
   */
  target: string;

  /**
   * How many bytes must be reserved at minimum on the source workspace's
   * volume and the target backup's volume during and after the backup
   * completes. Used to eagerly prevent a backup if there is not enough space.
   *
   * @default DEFAULT_MIN_AVAILABLE_STORAGE_BYTES
   */
  minAvailableStorageBytes?: number;
}

/**
 * Options for copying files from a backup staging area to a target.
 */
export interface CopyBackupOptions extends ProgressTracking {
  /**
   * The database ID of the election to be backed up.
   */
  electionId: Id;

  /**
   * The already-prepared backup staging area to copy.
   */
  source: BackupStagingArea;

  /**
   * A store attached to the staged database snapshot. You must not modify the
   * database in a way that would produce an invalid backup.
   */
  store: Store;

  /**
   * Directory path to place the backup. This may not be the final location.
   */
  backup: string;

  /**
   * How many bytes of a single file must be copied before another progress
   * event is emitted for it. Copying a large file emits an event roughly every
   * this many bytes rather than once per stream chunk.
   *
   * @default DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES
   */
  progressEventIntervalBytes?: number;
}

/**
 * Options for writing and signing a backup's manifest.
 */
export interface WriteManifestOptions extends ProgressTracking {
  /**
   * The manifest describing the backup's copied files.
   */
  manifest: BackupManifest;

  /**
   * Directory path of the backup whose manifest to write. This may not be the
   * final location.
   */
  backup: string;
}

/**
 * Options for swapping a finished backup into its final location.
 */
export interface SwapBackupOptions extends ProgressTracking {
  /**
   * Directory path of the finished backup awaiting its final location.
   */
  inProgressBackup: string;

  /**
   * Directory path of the root location containing all election backups.
   * Typically a USB drive's mount point.
   */
  target: string;

  /**
   * Final directory path for the backup.
   */
  backup: string;
}
