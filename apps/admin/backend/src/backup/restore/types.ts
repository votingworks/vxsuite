import { ProgressTracking } from '../progress.js';

/**
 * Possible expected errors that can occur when restoring a backup.
 */
export type RestoreError =
  | { type: 'cancelled'; message: string }
  | { type: 'workspace-already-configured'; message: string }
  | { type: 'not-host-mode'; message: string }
  | { type: 'backup-read-failed'; message: string }
  | { type: 'backup-authentication-failed'; message: string }
  | { type: 'backup-verification-failed'; message: string }
  | { type: 'unsupported-backup-version'; message: string }
  | { type: 'unsupported-software-version'; message: string }
  | {
      type: 'insufficient-workspace-storage';
      available: number;
      required: number;
      message: string;
    }
  | { type: 'workspace-flush-failed'; message: string };

/**
 * Options for restoring a backup into a workspace.
 */
export interface RestoreBackupOptions extends ProgressTracking {
  /**
   * Path to a directory containing a valid and signed backup.
   */
  backup: string;

  /**
   * Path of the workspace into which the backup should be restored. Its data
   * belongs to the restore: whatever it holds is emptied before copying begins,
   * so it must not contain anything worth keeping. A workspace whose database
   * is already configured with an election is refused rather than cleared.
   *
   * Nothing may be serving the workspace: the restore deletes its database,
   * and a process still reading that file would be reading nothing anyone will
   * see again. That is why a machine restores by rebooting into restore mode.
   */
  workspacePath: string;

  /**
   * How many bytes must remain available on the workspace's volume after the
   * restored files land. Used to eagerly refuse a restore that would fill the
   * disk.
   *
   * @default DEFAULT_MIN_AVAILABLE_STORAGE_BYTES
   */
  minAvailableStorageBytes?: number;

  /**
   * How many bytes of a single file must be copied before another progress
   * event is emitted for it. Copying a large file emits an event roughly every
   * this many bytes rather than once per chunk.
   *
   * @default DEFAULT_PROGRESS_EVENT_INTERVAL_BYTES
   */
  progressEventIntervalBytes?: number;
}
