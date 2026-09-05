import { BaseLogger, LogEventId } from '@votingworks/logging';
import { PrintJobId, PrintJobStatus } from '@votingworks/types';
import { extractErrorMessage } from '@votingworks/basics';
import { rootDebug } from '../utils/debug';
import { queryJobStatus } from './job_status';

const debug = rootDebug.extend('job-monitor');

/**
 * How often to ask CUPS about a job. A disconnect surfaces as `aborted` roughly
 * five seconds after the physical event, so this only needs to be small enough
 * that it adds no meaningful latency to that.
 */
export const JOB_POLL_INTERVAL = 500;

/**
 * How long a job may go without reaching a terminal state before we give up on
 * it. This is insurance against a job that hangs without CUPS ever faulting it,
 * not the mechanism that detects failure: real failures arrive as `aborted`
 * within seconds. Observed successful jobs complete well inside a minute, so
 * this is deliberately generous — declaring a good print failed is worse than
 * taking a while to notice a stuck one.
 */
export const JOB_TIMEOUT = 120_000;

/**
 * How long a job's terminal status stays readable after the job finishes, so a
 * caller polling for the result still observes it before the entry is dropped.
 */
export const TERMINAL_STATUS_RETENTION = 60_000;

/**
 * How many consecutive failed queries mean CUPS is unreachable rather than
 * briefly unhappy. A failed query says nothing about the job, so we tolerate a
 * few before concluding anything.
 */
export const MAX_CONSECUTIVE_QUERY_FAILURES = 3;

export interface PrintJobMonitorContext {
  jobId: PrintJobId;
  jobs: Map<PrintJobId, PrintJobStatus>;
  logger: BaseLogger;
}

export interface PrintJobMonitorOptions {
  pollInterval?: number;
  jobTimeout?: number;
  retention?: number;
}

/**
 * Watches a single CUPS print job until it reaches a terminal outcome, keeping
 * `jobs` up to date and logging the result.
 *
 * The job's entry is created synchronously, so a caller that reads `jobs`
 * immediately after submitting a job sees `in-progress` rather than nothing.
 */
export function startPrintJobMonitor(
  { jobId, jobs, logger }: PrintJobMonitorContext,
  {
    pollInterval = JOB_POLL_INTERVAL,
    jobTimeout = JOB_TIMEOUT,
    retention = TERMINAL_STATUS_RETENTION,
  }: PrintJobMonitorOptions = {}
): { stop(): void } {
  jobs.set(jobId, { outcome: 'in-progress' });

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
    // @coverage-exclude: defensive. Every caller already checks `finished`, but
    // this is the single terminal path and must stay idempotent.
    if (finished) {
      return;
    }
    stopTimers();

    debug('job %d finished: %o', jobId, status);
    jobs.set(jobId, status);
    logger.log(LogEventId.PrinterPrintComplete, 'system', {
      message:
        status.outcome === 'sent-to-printer'
          ? 'CUPS finished sending the print job to the printer.'
          : 'CUPS did not send the print job to the printer.',
      disposition: status.outcome === 'sent-to-printer' ? 'success' : 'failure',
      jobId,
      ...(status.reason ? { reason: status.reason } : {}),
    });

    setTimeout(() => jobs.delete(jobId), retention);
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
    // A tick may already have been queued when the timers were cleared, and a
    // slow query can outlast the poll interval.
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
            reason: 'CUPS no longer has a record of this print job.',
          });
          return;
        }
        onQueryFailure(error.message);
        return;
      }

      consecutiveQueryFailures = 0;
      const status = result.ok();
      if (status.outcome === 'in-progress') {
        jobs.set(jobId, status);
        return;
      }
      finish(status);
    } catch (error) {
      // `queryJobStatus` throws rather than returning an error if CUPS answers
      // with something unparseable. Treat that like any other failed query.
      if (!finished) {
        onQueryFailure(extractErrorMessage(error));
      }
    } finally {
      isPolling = false;
    }
  }

  pollTimer = setInterval(() => {
    void poll();
  }, pollInterval);

  timeoutTimer = setTimeout(() => {
    finish({
      outcome: 'failed',
      reason: `Print job did not reach a terminal state within ${jobTimeout}ms.`,
    });
  }, jobTimeout);

  return {
    stop: stopTimers,
  };
}
