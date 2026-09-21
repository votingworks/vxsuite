import { QueryKey, useQuery } from '@tanstack/react-query';
import { Result, assertDefined } from '@votingworks/basics';
import {
  PrintJobId,
  PrintJobOutcome,
  PrintJobStatus,
} from '@votingworks/types';

export const PRINT_JOB_STATUS_POLLING_INTERVAL_MS = 100;

/**
 * The backend methods a print job status query needs. Declared structurally so
 * that `libs/ui` need not depend on the package that implements them.
 */
export interface PrintJobStatusApiClient {
  getPrintJobStatus: (input: {
    jobId: PrintJobId;
  }) => Promise<Result<PrintJobStatus, Error>>;
}

/**
 * Reduces a print job status query result to the job's outcome. A job whose
 * status has not arrived yet is still in progress, and one we can no longer get
 * status for is treated as a failure rather than left pending, so the caller is
 * never left on an indefinite "printing" screen.
 */
export function getPrintOutcome(
  jobStatusResult?: Result<PrintJobStatus, Error>
): PrintJobOutcome {
  if (!jobStatusResult) return 'in-progress';
  if (jobStatusResult.isErr()) return 'failed';
  return jobStatusResult.ok().outcome;
}

function buildPrintJobStatusApi(getApiClient: () => PrintJobStatusApiClient) {
  return {
    queryKey(jobId: PrintJobId): QueryKey {
      return ['getPrintJobStatus', jobId];
    },
    useQuery(jobId?: PrintJobId) {
      const apiClient = getApiClient();
      return useQuery(
        this.queryKey(jobId ?? 0),
        () => apiClient.getPrintJobStatus({ jobId: assertDefined(jobId) }),
        {
          enabled: jobId !== undefined,
          // CUPS reuses job numbers so we don't want to cache old job status values
          cacheTime: 0,
          // Stop polling once the job settles; its status will not change again.
          refetchInterval: (result) =>
            result?.ok()?.outcome === 'in-progress'
              ? PRINT_JOB_STATUS_POLLING_INTERVAL_MS
              : false,
        }
      );
    },
  } as const;
}

export type PrintJobStatusReactQueryApi = ReturnType<
  typeof buildPrintJobStatusApi
>;

/**
 * Builds the react-query wrapper for polling a print job's status, given a way
 * to reach the app's API client.
 */
export function createPrintJobStatusApi(
  getApiClient: () => PrintJobStatusApiClient
): PrintJobStatusReactQueryApi {
  return buildPrintJobStatusApi(getApiClient);
}
