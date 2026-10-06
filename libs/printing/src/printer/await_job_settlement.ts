import type { Result } from '@votingworks/basics';
import type { PrintJobId, PrintJobStatus } from '@votingworks/types';
import { rootDebug } from '../utils/debug.js';
import type { JobSettlementMonitor } from './types.js';

const debug = rootDebug.extend('await-job-settlement');

export const JOB_SETTLEMENT_POLL_INTERVAL_MS = 500;

export interface AwaitJobSettlementContext {
  jobId: PrintJobId;

  /**
   * Reads the job's status as the printer sees it, without settlement masking.
   * Only a printer implementation should supply this; exposing it to callers is
   * what allows them to observe a terminal status before `onSettled` has run.
   */
  getRawStatus: () => Result<PrintJobStatus, Error>;

  clearJobQueue: () => Promise<void>;
  onSettled: (status: PrintJobStatus) => Promise<void>;
}

/**
 * Watches a submitted print job until it reaches a terminal state.
 */
export function awaitJobSettlement({
  jobId,
  getRawStatus,
  clearJobQueue,
  onSettled,
}: AwaitJobSettlementContext): JobSettlementMonitor {
  let pollTimer: NodeJS.Timeout;
  let settledStatus: PrintJobStatus | undefined;

  function stop(): void {
    clearInterval(pollTimer);
  }

  async function settle(status: PrintJobStatus): Promise<void> {
    stop();
    debug('job %d settled: %o', jobId, status);
    if (status.outcome === 'failed') {
      await clearJobQueue();
    }
    await onSettled(status);
    settledStatus = status;
  }

  async function poll(): Promise<void> {
    const statusResult = getRawStatus();
    if (statusResult.isErr()) {
      debug(
        'err fetching status for job %d, giving up: %s',
        jobId,
        statusResult.err().message
      );
      stop();
      settledStatus = {
        outcome: 'failed',
        reason: statusResult.err().message,
      };
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
  }, JOB_SETTLEMENT_POLL_INTERVAL_MS);

  return {
    stop,
    getStatus: () => settledStatus ?? { outcome: 'in-progress' },
  };
}
