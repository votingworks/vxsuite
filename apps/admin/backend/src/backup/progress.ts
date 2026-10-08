import type { Logger } from '@votingworks/logging';

/**
 * Basic options for all backup and restore steps.
 */
export interface ProgressTracking<Event> {
  /**
   * When given this callback will be called repeatedly as the operation
   * progresses.
   */
  onProgressEvent?: (event: Event) => void;

  /**
   * Where to send log messages during the operation.
   */
  logger: Logger;

  /**
   * When given, aborting this signal stops the operation at the next point it
   * can stop cleanly, and it reports `cancelled` rather than succeeding. What
   * has already been written is discarded, so a cancelled operation leaves
   * nothing half-finished behind.
   *
   * Cancelling is honored up to the point where the operation commits — where
   * a backup is swapped into its final location, and where a restore has all
   * the files down and only has to verify and flush them. Past that, finishing
   * is both quick and the only way to leave the disk in a state anyone can use.
   */
  signal?: AbortSignal;
}

interface CopyingFilesProgress {
  current?: string;
  copiedCount: number;
  totalCount: number;
  copiedBytes: number;
  totalBytes: number;
}

/**
 * Progress event for each step of the backup process.
 */
export type BackupProgressEvent =
  | { type: '1_preparing' }
  | { type: '2_db_snapshot'; progress: number }
  | { type: '3_staging_files'; progress: number }
  | ({ type: '4_copying_files' } & CopyingFilesProgress)
  | { type: '5_writing_manifest' }
  | { type: '6_flushing_backup' }
  | { type: '7_swapping_backup' }
  | { type: '8_flushing_swap' };

/**
 * Progress event for each step of the restore process.
 */
export type RestoreProgressEvent =
  | { type: '1_preparing' }
  | ({ type: '2_copying_files' } & CopyingFilesProgress)
  | { type: '3_verifying' }
  | { type: '4_flushing_workspace' };
