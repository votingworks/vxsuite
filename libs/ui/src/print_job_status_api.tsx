import { type QueryKey, useQuery } from '@tanstack/react-query';
import { type Result, assertDefined } from '@votingworks/basics';
import type {
  PrintJobId,
  PrintJobOutcome,
  PrintJobStatus,
} from '@votingworks/types';

export const PRINT_JOB_STATUS_POLLING_INTERVAL_MS = 100;

export interface PrintJobStatusApiClient {
  getPrintJobStatus: (input: {
    jobId: PrintJobId;
  }) => Promise<Result<PrintJobStatus, Error>>;
}

export function getPrintOutcome(
  jobStatusResult?: Result<PrintJobStatus, Error>
): PrintJobOutcome {
  if (!jobStatusResult) return 'in-progress';
  if (jobStatusResult.isErr()) return 'failed';
  return jobStatusResult.ok().outcome;
}

function buildPrintJobStatusApi(getApiClient: () => PrintJobStatusApiClient) {
  return {
    queryKey(jobId?: PrintJobId): QueryKey {
      return ['getPrintJobStatus', jobId];
    },
    useQuery(jobId?: PrintJobId) {
      const apiClient = getApiClient();
      return useQuery(
        this.queryKey(jobId),
        () => apiClient.getPrintJobStatus({ jobId: assertDefined(jobId) }),
        {
          enabled: jobId !== undefined,
          // CUPS reuses job numbers so we don't want to cache old job status values
          cacheTime: 0,
          // Status is unchanged after job settles, so we can stop polling
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

export function createPrintJobStatusApi(
  getApiClient: () => PrintJobStatusApiClient
): PrintJobStatusReactQueryApi {
  return buildPrintJobStatusApi(getApiClient);
}
