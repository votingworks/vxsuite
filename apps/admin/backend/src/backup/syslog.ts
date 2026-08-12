/**
 * The syslog tag the `backups` CLI's log lines carry, so they can be told apart
 * from the running app's.
 */
export const SYSLOG_TAG = 'vx-admin-backups';

const SYSLOG_PRIORITY = 'user.info';

/**
 * Sends log lines to the system log, where the machine's log collection can
 * pick them up. A program run by hand isn't started by the service manager that
 * collects the app's output, so without this its log lines would exist only in
 * whatever terminal it was run from, and would be missing from an exported log
 * bundle.
 *
 * `logger(1)` does the writing because the system log socket is a Unix datagram
 * socket, which Node cannot open: `dgram` speaks only UDP, and `net` refuses
 * the socket with `EPROTOTYPE`.
 */
export interface SyslogWriter {
  write: (logLine: string) => void;
  /**
   * Resolves once every line handed to {@link SyslogWriter.write} has been
   * written, with whatever went wrong along the way. A machine with no system
   * log still has a backup to make, so failures are collected and reported
   * rather than thrown.
   */
  flush: () => Promise<readonly unknown[]>;
}

/**
 * Builds a {@link SyslogWriter}. `exec` is a parameter rather than a direct
 * import so that a test can see what would have been written without a system
 * log to write it to.
 */
export function createSyslogWriter({
  exec,
}: {
  exec: (file: string, args: string[]) => Promise<unknown>;
}): SyslogWriter {
  // Writes are chained rather than issued in parallel so that lines reach the
  // log in the order they were made.
  let pending: Promise<void> = Promise.resolve();
  const errors: unknown[] = [];

  return {
    write(logLine) {
      pending = pending.then(async () => {
        try {
          await exec('logger', [
            '--tag',
            SYSLOG_TAG,
            '--priority',
            SYSLOG_PRIORITY,
            '--',
            logLine,
          ]);
        } catch (error) {
          errors.push(error);
        }
      });
    },

    async flush() {
      await pending;
      return errors;
    },
  };
}
