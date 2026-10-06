import { type Result, ok } from '@votingworks/basics';
import type { PrintJobId, PrintJobStatus } from '@votingworks/types';
import { awaitJobSettlement } from './await_job_settlement.js';
import type { JobSettlementMonitor } from './types.js';

export interface SettlementRegistryContext {
  getRawStatus: (jobId: PrintJobId) => Result<PrintJobStatus, Error>;
  clearJobQueue: () => Promise<void>;
}

export interface SettlementRegistry {
  getJobStatus: (jobId: PrintJobId) => Result<PrintJobStatus, Error>;
  awaitJobSettlement: (
    jobId: PrintJobId,
    onSettled: (status: PrintJobStatus) => Promise<void>
  ) => JobSettlementMonitor;
}

/**
 * Holds the settlement watches a printer has started, so the printer can report
 * a job as `in-progress` until its watch has finished running `onSettled`.
 */
export function createSettlementRegistry({
  getRawStatus,
  clearJobQueue,
}: SettlementRegistryContext): SettlementRegistry {
  const monitors = new Map<PrintJobId, JobSettlementMonitor>();

  return {
    getJobStatus: (jobId) => {
      const monitor = monitors.get(jobId);
      return monitor ? ok(monitor.getStatus()) : getRawStatus(jobId);
    },

    awaitJobSettlement: (jobId, onSettled) => {
      const monitor = awaitJobSettlement({
        jobId,
        getRawStatus: () => getRawStatus(jobId),
        clearJobQueue,
        onSettled: async (status) => {
          await onSettled(status);
          // The raw status is the same from here on, so stop masking it.
          monitors.delete(jobId);
        },
      });
      monitors.set(jobId, monitor);
      return monitor;
    },
  };
}
