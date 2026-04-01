import makeDebug from 'debug';

const debug = makeDebug('admin:auto-backup');

/**
 * Default delay before triggering an auto-backup after a change.
 * Resets each time a new change is observed.
 */
const AUTO_BACKUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum time since the first un-backed-up change before forcing a backup.
 */
const MAX_BACKUP_DELAY_MS = 30 * 60 * 1000; // 30 minutes

/** Callbacks invoked by the auto-backup scheduler. */
export interface AutoBackupSchedulerCallbacks {
  onTrigger: () => void;
}

/**
 * Schedules automatic backups after database changes.
 *
 * After any database change:
 * - Starts (or restarts) a 5-minute countdown
 * - When the countdown elapses, triggers a backup
 * - If changes keep coming and prevent the countdown from completing,
 *   a backup is forced 30 minutes after the first un-backed-up change
 */
export class AutoBackupScheduler {
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private firstChangeTime: number | null = null;
  private needsBackup = false;
  private stopped = false;

  constructor(
    private readonly callbacks: AutoBackupSchedulerCallbacks,
    private readonly autoBackupDelayMs: number = AUTO_BACKUP_DELAY_MS,
    private readonly maxBackupDelayMs: number = MAX_BACKUP_DELAY_MS
  ) {}

  /**
   * Call this whenever the database changes.
   */
  notifyChange(): void {
    if (this.stopped) return;

    this.needsBackup = true;

    // Record time of first un-backed-up change
    if (this.firstChangeTime === null) {
      this.firstChangeTime = Date.now();

      // Set the maximum delay timer
      this.maxDelayTimer = setTimeout(() => {
        debug('max delay reached, triggering backup');
        this.trigger();
      }, this.maxBackupDelayMs);
    }

    // Reset the quiet-period timer
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
    }

    this.delayTimer = setTimeout(() => {
      debug('quiet period elapsed, triggering backup');
      this.trigger();
    }, this.autoBackupDelayMs);
  }

  /**
   * Call this when a backup completes (successfully or not).
   */
  notifyBackupComplete(): void {
    this.needsBackup = false;
    this.firstChangeTime = null;
    this.clearTimers();
  }

  /**
   * Returns whether the database has changes that need backing up.
   */
  isBackupNeeded(): boolean {
    return this.needsBackup;
  }

  /**
   * Stop the scheduler and clean up timers.
   */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
  }

  private trigger(): void {
    this.clearTimers();
    if (!this.needsBackup || this.stopped) return;
    this.callbacks.onTrigger();
  }

  private clearTimers(): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    if (this.maxDelayTimer !== null) {
      clearTimeout(this.maxDelayTimer);
      this.maxDelayTimer = null;
    }
  }
}
