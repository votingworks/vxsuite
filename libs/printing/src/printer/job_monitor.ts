import { BaseLogger, LogEventId } from '@votingworks/logging';
import { PrintJobId, PrintJobStatus } from '@votingworks/types';
import { extractErrorMessage } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { queryJobStatus } from './job_status';

const debug = rootDebug.extend('job-monitor');

/**
 * How often to ask CUPS about a job.
 */
export const JOB_POLL_INTERVAL_MS = 500;

/**
 * How long a job may go without reaching a terminal state before we give up on
 * it. This is a failsafe in case a job hangs and CUPS never reports it failed.
 *
 * Note that because jobs reach a terminal state after CUPS transmits the job
 * and its data to the printer, the timeout is not concerned with how long the
 * actual job takes. 2 minutes is not always enough time to physically complete
 * the print job, but should be plenty to transmit the job.
 */
export const JOB_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * How long a job's terminal status stays readable after the job finishes, so a
 * caller polling for the result still observes it before the entry is dropped.
 */
export const TERMINAL_STATUS_RETENTION_MS = 5 * 60 * 1000;

/**
 * How many consecutive failed queries mean CUPS is permanently, rather than
 * momentarily, intermittently unavailable.
 * See {@link getConnectedDeviceUris} for details about why CUPS may be
 * momentarily unavailable.
 */
export const MAX_CONSECUTIVE_QUERY_FAILURES = 3;

export interface PrintJobMonitorContext {
  jobId: PrintJobId;
  setStatus: (status: PrintJobStatus) => void;
  clearStatus: () => void;
  logger: BaseLogger;
}

/**
 * Watches a single CUPS print job until it reaches a terminal outcome,
 * reporting status through `setStatus` and logging the result.
 *
 * `setStatus` is called synchronously before polling begins, so a caller that
 * reads status immediately after submitting a job sees `in-progress` rather
 * than nothing. `clearStatus` is called once the retention window elapses.
 */
export function startPrintJobMonitor({
  jobId,
  setStatus,
  clearStatus,
  logger,
}: PrintJobMonitorContext): { stop(): void } {
  setStatus({ outcome: 'in-progress' });

  let finished = false;
  let isPolling = false;
  let consecutiveQueryFailures = 0;
  let pollTimer: NodeJS.Timeout;
  let timeoutTimer: NodeJS.Timeout;

  function stopTimers(): void {
    finished = true;
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
  }

  function finish(status: PrintJobStatus): void {
    // @coverage-exclude: defensive. Every caller already checks `finished`.
    if (finished) {
      return;
    }
    stopTimers();

    debug('job %d finished: %o', jobId, status);
    setStatus(status);
    logger.log(LogEventId.PrinterPrintComplete, 'system', {
      message:
        status.outcome === 'sent-to-printer'
          ? 'CUPS finished sending the print job to the printer.'
          : 'CUPS did not send the print job to the printer.',
      disposition: status.outcome === 'sent-to-printer' ? 'success' : 'failure',
      jobId,
      reason: status.reason,
    });

    setTimeout(clearStatus, TERMINAL_STATUS_RETENTION_MS);
  }

  function onQueryFailure(message: string): void {
    consecutiveQueryFailures += 1;
    debug(
      'job %d query failed (%d/%d): %s',
      jobId,
      consecutiveQueryFailures,
      MAX_CONSECUTIVE_QUERY_FAILURES,
      message
    );
    if (consecutiveQueryFailures >= MAX_CONSECUTIVE_QUERY_FAILURES) {
      finish({
        outcome: 'failed',
        reason: `Unable to reach CUPS for print job status: ${message}`,
      });
    }
  }

  async function poll(): Promise<void> {
    if (finished || isPolling) {
      return;
    }
    isPolling = true;

    try {
      const result = await queryJobStatus(jobId);

      // The timeout may have fired while the query was in flight, in which case
      // the job already has a terminal status that must not be overwritten.
      if (finished) {
        return;
      }

      if (result.isErr()) {
        const error = result.err();
        if (error.type === 'unknown-job') {
          finish({
            outcome: 'failed',
            reason: `CUPS has no record of print job ${jobId}.`,
          });
          return;
        }
        onQueryFailure(error.message);
        return;
      }

      consecutiveQueryFailures = 0;
      const status = result.ok();
      if (status.outcome === 'in-progress') {
        setStatus(status);
        return;
      }

      finish(status);
    } catch (error) {
      if (!finished) {
        onQueryFailure(extractErrorMessage(error));
      }
    } finally {
      isPolling = false;
    }
  }

  pollTimer = setInterval(() => {
    void poll();
  }, JOB_POLL_INTERVAL_MS);

  timeoutTimer = setTimeout(() => {
    finish({
      outcome: 'failed',
      reason: `Print job did not reach a terminal state within ${JOB_TIMEOUT_MS}ms.`,
    });
  }, JOB_TIMEOUT_MS);

  return {
    stop: stopTimers,
  };
}
