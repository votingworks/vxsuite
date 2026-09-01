import { Logger } from '@votingworks/logging';

/**
 * Basic options for all backup and restore steps.
 */
export interface ProgressTracking {
  /**
   * When given this callback will be called repeatedly as the operation
   * progresses.
   */
  onProgressEvent?: (event: ProgressEvent) => void;

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

/**
 * All expected events that may occur while creating or restoring a backup. The
 * two operations share the vocabulary where the work is the same (`preparing`,
 * `copy_files`), so a progress display can serve both; the remaining phases
 * each belong to one side.
 */
export type ProgressEvent =
  | { type: 'preparing' }
  | { type: 'db_snapshot'; progress: number }
  | { type: 'staging_files'; progress: number }
  | {
      type: 'copy_files';
      current?: string;
      copiedCount: number;
      totalCount: number;
      copiedBytes: number;
      totalBytes: number;
    }
  | { type: 'writing_manifest' }
  | { type: 'flushing_backup' }
  | { type: 'swapping_backup' }
  | { type: 'verifying' }
  | { type: 'flushing_workspace' };
