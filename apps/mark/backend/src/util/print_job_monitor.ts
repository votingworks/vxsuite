import { Printer } from '@votingworks/printing';
import { PrintJobId, PrintJobStatus } from '@votingworks/types';
import { rootDebug } from './debug.js';

const debug = rootDebug.extend('print-job-monitor');

export const PRINT_JOB_POLL_INTERVAL_MS = 500;

export interface PrintJobMonitorContext {
  jobId: PrintJobId;
  printer: Printer;
  onSettled: (status: PrintJobStatus) => Promise<void>;
}

/**
 * Watches a submitted print job until it reaches a terminal state.
 */
export function startPrintJobMonitor({
  jobId,
  printer,
  onSettled,
}: PrintJobMonitorContext): { stop(): void } {
  let pollTimer: NodeJS.Timeout;

  function stop(): void {
    clearInterval(pollTimer);
  }

  async function settle(status: PrintJobStatus): Promise<void> {
    stop();
    debug('job %d settled: %o', jobId, status);
    if (status.outcome === 'failed') {
      await printer.clearJobQueue();
    }
    await onSettled(status);
  }

  async function poll(): Promise<void> {
    const statusResult = printer.getJobStatus(jobId);
    if (statusResult.isErr()) {
      debug(
        'err fetching status for job %d, giving up: %s',
        jobId,
        statusResult.err().message
      );
      stop();
      return;
    }

    const status = statusResult.ok();
    if (status.outcome === 'in-progress') {
      return;
    }
    await settle(status);
  }

  pollTimer = setInterval(() => {
    void poll();
  }, PRINT_JOB_POLL_INTERVAL_MS);

  return { stop };
}
