import React from 'react';
import { deepEqual, fail } from '@votingworks/basics';
import type { Api } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  usePollingQuery,
  asMutationFn,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import type {
  UsbDriveStatus,
  UsbPartitionMountpoint,
} from '@votingworks/usb-drive';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './utils/globals.js';

export const PRINTER_STATUS_POLLING_INTERVAL_MS = 100;

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  // @coverage-defer
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  });
}

export const getMachineConfig = {
  queryKeyPrefix: 'getMachineConfig',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMachineConfig(),
    });
  },
} as const;

export const getMachineMode = {
  queryKeyPrefix: 'getMachineMode',
  // @coverage-defer
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  // @coverage-defer
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMachineMode(),
    });
  },
} as const;

export const setMachineMode = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setMachineMode),
    });
  },
} as const;

export const getScannerImportCounts = {
  queryKey(): QueryKey {
    return ['getScannerImportCounts'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getScannerImportCounts(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const getNetworkStatus = {
  queryKey(): QueryKey {
    return ['getNetworkStatus'];
  },
  usePollingQuery({ enabled }: { enabled: boolean } = { enabled: true }) {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getNetworkStatus(),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      { enabled }
    );
  },
} as const;

export const getIsClientAdjudicationEnabled = {
  queryKey(): QueryKey {
    return ['getIsClientAdjudicationEnabled'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getIsClientAdjudicationEnabled(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const setIsClientAdjudicationEnabled = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setIsClientAdjudicationEnabled),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getIsClientAdjudicationEnabled.queryKey(),
        });
      },
    });
  },
} as const;

// Auth

export const getAuthStatus = {
  queryKeyPrefix: 'getAuthStatus',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getAuthStatus(),
      AUTH_STATUS_POLLING_INTERVAL_MS,
      {
        structuralSharing(oldData, newData) {
          if (!oldData) {
            return newData;
          }

          // Prevent infinite re-renders of the app tree:
          const isUnchanged = deepEqual(oldData, newData);
          return isUnchanged ? oldData : newData;
        },
      }
    );
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkPin),

      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logOut),

      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateSessionExpiry),

      // @coverage-defer
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const getPrinterStatus = {
  queryKey(): QueryKey {
    return ['getPrinterStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getPrinterStatus(),
      PRINTER_STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getUsbDriveStatus(),

      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent unnecessary re-renders of dependent components
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.ejectUsbDrive),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getUsbDriveStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.formatUsbDrive),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getUsbDriveStatus.queryKey(),
        });
      },
    });
  },
} as const;

// Queries

type QueryInput<Method extends keyof ApiClient> = Parameters<
  ApiClient[Method]
>[0];

export const getCurrentElectionMetadata = {
  queryKey(): QueryKey {
    return ['getCurrentElectionMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getCurrentElectionMetadata(),
    });
  },
} as const;

export const listCastVoteRecordFilesOnUsb = {
  queryKey(usbPath?: UsbPartitionMountpoint): QueryKey {
    return ['listCastVoteRecordFilesOnUsb', usbPath];
  },
  useQuery(usb: UsbDriveStatus) {
    const apiClient = useApiClient();
    const path = usb.status === 'mounted' ? usb.mountpoint : undefined;

    return useQuery({
      queryKey: this.queryKey(path),
      queryFn: () => apiClient.listCastVoteRecordFilesOnUsb(),
      enabled: usb.status === 'mounted',
      refetchOnMount: true,
      staleTime: 0,
    });
  },
} as const;

export const getCastVoteRecordFiles = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFiles'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getCastVoteRecordFiles(),
    });
  },
} as const;

export const getCastVoteRecordFileMode = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFileMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getCastVoteRecordFileMode(),
    });
  },
} as const;

export const getBallotAdjudicationQueue = {
  queryKey(): QueryKey {
    return ['getBallotAdjudicationQueue'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getBallotAdjudicationQueue(),
    });
  },
} as const;

export const getBallotAdjudicationQueueMetadata = {
  queryKey(): QueryKey {
    return ['getBallotAdjudicationQueueMetadata'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getBallotAdjudicationQueueMetadata(),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      { staleTime: 0 }
    );
  },
} as const;

export const getNextCvrIdForBallotAdjudication = {
  queryKey(): QueryKey {
    return ['getNextCvrIdForBallotAdjudication'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getNextCvrIdForBallotAdjudication(),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      {
        gcTime: 0,
        staleTime: 0,
      }
    );
  },
} as const;

type GetBallotImages = QueryInput<'getBallotImages'>;
export const getBallotImages = {
  queryKey(input?: GetBallotImages): QueryKey {
    // @coverage-defer
    return input ? ['getBallotImages', input.cvrId] : ['getBallotImages'];
  },
  useQuery(input?: GetBallotImages) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),

      queryFn: input
        ? () =>
            // @coverage-defer
            apiClient.getBallotImages({
              cvrId: input.cvrId,
            })
        : // @coverage-exclude
          () => fail('input is required'),

      enabled: !!input,
      placeholderData: keepPreviousData,
    });
  },
  // @coverage-defer
  usePrefetch() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return (input: GetBallotImages) =>
      queryClient.prefetchQuery({
        queryKey: getBallotImages.queryKey(input),
        queryFn: () => apiClient.getBallotImages(input),
      });
  },
} as const;

type GetWriteInCandidatesInput = QueryInput<'getWriteInCandidates'>;
export const getWriteInCandidates = {
  queryKey(input?: GetWriteInCandidatesInput): QueryKey {
    return input ? ['getWriteInCandidates', input] : ['getWriteInCandidates'];
  },
  usePollingQuery(
    input?: GetWriteInCandidatesInput,
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(input),
      () => apiClient.getWriteInCandidates(input),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      {
        staleTime: 0,
        ...options,
      }
    );
  },
} as const;

export const getQualifiedWriteInCandidates = {
  queryKey(): QueryKey {
    return ['getQualifiedWriteInCandidates'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getQualifiedWriteInCandidates(),
    });
  },
} as const;

export const updateQualifiedWriteInCandidates = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateQualifiedWriteInCandidates),

      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
        await queryClient.invalidateQueries({
          queryKey: getBallotAdjudicationQueueMetadata.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getBallotAdjudicationQueue.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getNextCvrIdForBallotAdjudication.queryKey(),
        });
      },
    });
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getSystemSettings(),
    });
  },
} as const;

type GetLiveResultsReportingUrlInput = QueryInput<'getLiveResultsReportingUrl'>;
export const getLiveResultsReportingUrl = {
  queryKeyPrefix: 'getLiveResultsReportingUrl',
  queryKey(input?: GetLiveResultsReportingUrlInput): QueryKey {
    return input ? [this.queryKeyPrefix, input] : [this.queryKeyPrefix];
  },
  useQuery(input?: GetLiveResultsReportingUrlInput) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),

      // @coverage-defer
      queryFn: input
        ? () => apiClient.getLiveResultsReportingUrl(input)
        : // @coverage-exclude
          () => fail('input is required'),

      enabled: !!input,

      // Handle signing failures (e.g. results too large for QR codes)
      // inline on the screen instead of escalating to the error boundary.
      throwOnError: false,
    });
  },
} as const;

export const getLiveReportsPollingPlaces = {
  queryKey(): QueryKey {
    return ['getLiveReportsPollingPlaces'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getLiveReportsPollingPlaces(),
    });
  },
} as const;

type GetManualResultsInput = QueryInput<'getManualResults'>;
export const getManualResults = {
  queryKey(input?: GetManualResultsInput): QueryKey {
    return input ? ['getManualResults', input] : ['getManualResults'];
  },
  useQuery(input: GetManualResultsInput) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),

      queryFn: () => apiClient.getManualResults(input),
    });
  },
} as const;

export const getManualResultsMetadata = {
  queryKey(): QueryKey {
    return ['getManualResultsMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getManualResultsMetadata(),
    });
  },
} as const;

export const getTotalBallotCount = {
  queryKey(): QueryKey {
    return ['getTotalBallotCount'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getTotalBallotCount(),
    });
  },
} as const;

export const getScannerBatches = {
  queryKey(): QueryKey {
    return ['getScannerBatches'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getScannerBatches(),
    });
  },
} as const;

export const listPotentialElectionPackagesOnUsbDrive = {
  // Refetch if USB drive status changes
  queryKey(usbDriveStatus: UsbDriveStatus): QueryKey {
    return ['listPotentialElectionPackagesOnUsbDrive', usbDriveStatus];
  },
  useQuery(usbDriveStatus: UsbDriveStatus) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(usbDriveStatus),
      queryFn: () => apiClient.listPotentialElectionPackagesOnUsbDrive(),
      staleTime: 0,
    });
  },
} as const;

type GetTallyReportPreviewInput = QueryInput<'getTallyReportPreview'>;
export const getTallyReportPreview = {
  queryKey(input?: GetTallyReportPreviewInput): QueryKey {
    // @coverage-defer
    return input ? ['getTallyReportPreview', input] : ['getTallyReportPreview'];
  },
  useQuery(
    input: GetTallyReportPreviewInput,
    // @coverage-defer
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getTallyReportPreview(input),
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
      ...options,
    });
  },
} as const;

type GetBallotCountReportPreviewInput =
  QueryInput<'getBallotCountReportPreview'>;
export const getBallotCountReportPreview = {
  queryKey(input?: GetBallotCountReportPreviewInput): QueryKey {
    // @coverage-defer
    return input
      ? ['getBallotCountReportPreview', input]
      : ['getBallotCountReportPreview'];
  },
  useQuery(
    input: GetBallotCountReportPreviewInput,
    // @coverage-defer
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getBallotCountReportPreview(input),
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
      ...options,
    });
  },
} as const;

export const getWriteInAdjudicationReportPreview = {
  queryKey(): QueryKey {
    return ['getWriteInAdjudicationReportPreview'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getWriteInAdjudicationReportPreview(),
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
    });
  },
} as const;

export const getMostRecentPrinterDiagnostic = {
  queryKey(): QueryKey {
    return ['getDiagnosticRecords'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentPrinterDiagnostic(),
    });
  },
} as const;

export const getDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDiskSpaceSummary(),

      // disk space availability could change between queries for a variety
      // reasons, so always treat it as stale
      staleTime: 0,
    });
  },
} as const;

// Grouped Invalidations

function invalidateCastVoteRecordQueries(
  queryClient: QueryClient,
  {
    adjudicationQueueRefetchType = 'active',
  }: { adjudicationQueueRefetchType?: 'active' | 'none' } = {}
) {
  return Promise.all([
    // cast vote record endpoints
    queryClient.invalidateQueries({
      queryKey: getCastVoteRecordFileMode.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getCastVoteRecordFiles.queryKey(),
    }),

    // scanner batches are generated from cast vote records
    queryClient.invalidateQueries({
      queryKey: getScannerBatches.queryKey(),
    }),

    // total ballot count may be affected
    queryClient.invalidateQueries({
      queryKey: getTotalBallotCount.queryKey(),
    }),

    // live reports polling places and any signed live-results URLs depend
    // on the loaded CVR batches
    queryClient.resetQueries({
      queryKey: getLiveReportsPollingPlaces.queryKey(),
    }),
    queryClient.resetQueries({
      queryKey: getLiveResultsReportingUrl.queryKey(),
    }),

    // ballot adjudication queues
    queryClient.invalidateQueries({
      queryKey: getBallotAdjudicationQueue.queryKey(),
      refetchType: adjudicationQueueRefetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: getBallotAdjudicationQueueMetadata.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getNextCvrIdForBallotAdjudication.queryKey(),
    }),
  ]);
}

function invalidateWriteInQueries(queryClient: QueryClient) {
  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: getWriteInCandidates.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getQualifiedWriteInCandidates.queryKey(),
    }),
  ];

  return Promise.all(invalidations);
}

function invalidateManualResultsQueries(queryClient: QueryClient) {
  return Promise.all([
    // manual results queries
    queryClient.invalidateQueries({
      queryKey: getManualResults.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getManualResultsMetadata.queryKey(),
    }),

    // total ballot count may be affected
    queryClient.invalidateQueries({
      queryKey: getTotalBallotCount.queryKey(),
    }),

    // live reports polling places and any signed live-results URLs depend
    // on the loaded CVR batches
    queryClient.resetQueries({
      queryKey: getLiveReportsPollingPlaces.queryKey(),
    }),
    queryClient.resetQueries({
      queryKey: getLiveResultsReportingUrl.queryKey(),
    }),
  ]);
}

// Mutations

export const configure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.configure),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getCurrentElectionMetadata.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getSystemSettings.queryKey(),
        });
      },
    });
  },
} as const;

export const unconfigure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.unconfigure),

      async onSuccess() {
        // If we configure with a different election, any data in the cache will
        // correspond to the previous election, so we don't just invalidate, but
        // reset all queries to clear their cached data, since invalidated
        // queries may still return stale data while refetching.
        await queryClient.resetQueries();
      },
    });
  },
} as const;

export const markResultsOfficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.markResultsOfficial),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getCurrentElectionMetadata.queryKey(),
        });
      },
    });
  },
} as const;

export const revertResultsToUnofficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.revertResultsToUnofficial),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getCurrentElectionMetadata.queryKey(),
        });
      },
    });
  },
} as const;

export const clearCastVoteRecordFiles = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.clearCastVoteRecordFiles),

      async onSuccess() {
        return Promise.all([
          invalidateCastVoteRecordQueries(queryClient),
          invalidateWriteInQueries(queryClient),
          queryClient.invalidateQueries({
            queryKey: getCurrentElectionMetadata.queryKey(),
          }),
        ]);
      },
    });
  },
} as const;

export const deleteCvrFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.deleteCvrFile),

      async onSuccess() {
        return Promise.all([
          invalidateCastVoteRecordQueries(queryClient),
          invalidateWriteInQueries(queryClient),
        ]);
      },
    });
  },
} as const;

export const getCastVoteRecordsDataVersion = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordsDataVersion'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getCastVoteRecordsDataVersion(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

/**
 * Invalidates everything derived from cast vote records. Exposed for the
 * refresher that reacts to server-side (network) imports, which have no
 * frontend mutation to hang invalidation on.
 */
export async function invalidateCastVoteRecordDerivedQueries(
  queryClient: QueryClient
): Promise<void> {
  await invalidateCastVoteRecordQueries(queryClient, {
    adjudicationQueueRefetchType: 'none',
  });
  await invalidateWriteInQueries(queryClient);
}

export const addCastVoteRecordFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.addCastVoteRecordFile),

      async onSuccess() {
        await invalidateCastVoteRecordQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const importElectionResultsReportingFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.importElectionResultsReportingFile),

      async onSuccess() {
        // The backend treats ERR files like manual results
        await invalidateManualResultsQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const setManualResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setManualResults),

      async onSuccess() {
        await invalidateManualResultsQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const deleteAllManualResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.deleteAllManualResults),

      async onSuccess() {
        await invalidateManualResultsQueries(queryClient);
        await queryClient.invalidateQueries({
          queryKey: getWriteInCandidates.queryKey(),
        });
      },
    });
  },
} as const;

export const deleteManualResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.deleteManualResults),

      async onSuccess() {
        await invalidateManualResultsQueries(queryClient);
        await queryClient.invalidateQueries({
          queryKey: getWriteInCandidates.queryKey(),
        });
      },
    });
  },
} as const;

export const adjudicateCvr = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.adjudicateCvr),

      async onSuccess() {
        await Promise.all([
          invalidateWriteInQueries(queryClient),
          queryClient.invalidateQueries({
            queryKey: getBallotAdjudicationQueue.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: getBallotAdjudicationQueueMetadata.queryKey(),
          }),
        ]);
      },
    });
  },
} as const;

export const claimAndLoadBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.claimAndLoadBallot),
    });
  },
} as const;

export const releaseBallotAdjudicationClaim = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.releaseBallotAdjudicationClaim),
    });
  },
} as const;

export const saveElectionPackageToUsb = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveElectionPackageToUsb),
    });
  },
} as const;

export const printTallyReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTallyReport),
    });
  },
} as const;

export const exportTallyReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportTallyReportPdf),
    });
  },
} as const;

export const exportTallyReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportTallyReportCsv),
    });
  },
} as const;

export const exportCdfElectionResultsReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportCdfElectionResultsReport),
    });
  },
} as const;

export const printBallotCountReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printBallotCountReport),
    });
  },
} as const;

export const exportBallotCountReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportBallotCountReportPdf),
    });
  },
} as const;

export const exportBallotCountReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportBallotCountReportCsv),
    });
  },
} as const;

export const printWriteInAdjudicationReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printWriteInAdjudicationReport),
    });
  },
} as const;

export const exportWriteInAdjudicationReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportWriteInAdjudicationReportPdf),
    });
  },
} as const;

export const getWriteInImageReportPreview = {
  queryKey(contestId: string): QueryKey {
    return ['getWriteInImageReportPreview', contestId];
  },
  useQuery(contestId?: string) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: contestId
        ? this.queryKey(contestId)
        : ['getWriteInImageReportPreview'],

      // @coverage-exclude
      queryFn: () =>
        contestId
          ? apiClient.getWriteInImageReportPreview({ contestId })
          : fail('contestId is required'),

      enabled: !!contestId,
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
    });
  },
} as const;

export const printWriteInImageReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printWriteInImageReport),
    });
  },
} as const;

export const exportWriteInImageReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportWriteInImageReportPdf),
    });
  },
} as const;

export const getRegisteredVoterCounts = {
  queryKey(): QueryKey {
    return ['getRegisteredVoterCounts'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getRegisteredVoterCounts(),
    });
  },
} as const;

export const getVoterTurnoutReportPreview = {
  queryKey(): QueryKey {
    return ['getVoterTurnoutReportPreview'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getVoterTurnoutReportPreview(),
      gcTime: 0,
      staleTime: 0,
      refetchOnWindowFocus: false,
    });
  },
} as const;

export const printVoterTurnoutReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printVoterTurnoutReport),
    });
  },
} as const;

export const exportVoterTurnoutReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportVoterTurnoutReportPdf),
    });
  },
} as const;

export const addDiagnosticRecord = {
  useMutation() {
    const queryClient = useQueryClient();
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.addDiagnosticRecord),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentPrinterDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const printTestPage = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printTestPage),
    });
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveReadinessReport),
    });
  },
} as const;
