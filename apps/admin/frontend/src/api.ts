import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { Api } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export const getMachineConfig = {
  queryKeyPrefix: 'getMachineConfig',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

// Auth

export const getAuthStatus = {
  queryKeyPrefix: 'getAuthStatus',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent infinite re-renders of the app tree:
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSessionExpiry, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const programCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.programCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const unprogramCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unprogramCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
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
    return useMutation(apiClient.ejectUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.formatUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

// Queries

type QueryInput<Method extends keyof ApiClient> = Parameters<
  ApiClient[Method]
>[0];

export const generateLiveCheckQrCodeValue = {
  queryKey(): QueryKey {
    return ['generateLiveCheckQrCodeValue'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.generateLiveCheckQrCodeValue(),
      { cacheTime: 0 } // Always generate a fresh QR code value
    );
  },
} as const;

export const getCurrentElectionMetadata = {
  queryKey(): QueryKey {
    return ['getCurrentElectionMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCurrentElectionMetadata()
    );
  },
} as const;

export const listCastVoteRecordFilesOnUsb = {
  queryKey(): QueryKey {
    return ['listCastVoteRecordFilesOnUsb'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.listCastVoteRecordFilesOnUsb()
    );
  },
} as const;

export const getCastVoteRecordFiles = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFiles'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCastVoteRecordFiles());
  },
} as const;

export const getCastVoteRecordFileMode = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFileMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCastVoteRecordFileMode()
    );
  },
} as const;

type GetWriteInAdjudicationQueueInput =
  QueryInput<'getWriteInAdjudicationQueue'>;
export const getWriteInAdjudicationQueue = {
  queryKey(input?: GetWriteInAdjudicationQueueInput): QueryKey {
    return input
      ? ['getWriteInAdjudicationQueue', input]
      : ['getWriteInAdjudicationQueue'];
  },
  useQuery(input: GetWriteInAdjudicationQueueInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInAdjudicationQueue(input)
    );
  },
} as const;

type GetFirstPendingWriteInIdInput = QueryInput<'getFirstPendingWriteInId'>;
export const getFirstPendingWriteInId = {
  queryKey(input?: GetFirstPendingWriteInIdInput): QueryKey {
    return input
      ? ['getFirstPendingWriteInId', input]
      : ['getFirstPendingWriteInId'];
  },
  useQuery(input: GetFirstPendingWriteInIdInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getFirstPendingWriteInId(input),
      {
        cacheTime: 0,
      }
    );
  },
} as const;

type GetWriteInAdjudicationQueueMetadataInput =
  QueryInput<'getWriteInAdjudicationQueueMetadata'>;
export const getWriteInAdjudicationQueueMetadata = {
  queryKey(input?: GetWriteInAdjudicationQueueMetadataInput): QueryKey {
    return input
      ? ['getWriteInAdjudicationQueueMetadata', input]
      : ['getWriteInAdjudicationQueueMetadata'];
  },
  useQuery(input?: GetWriteInAdjudicationQueueMetadataInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInAdjudicationQueueMetadata(input)
    );
  },
} as const;

type GetWriteInCandidatesInput = QueryInput<'getWriteInCandidates'>;
export const getWriteInCandidates = {
  queryKey(input?: GetWriteInCandidatesInput): QueryKey {
    return input ? ['getWriteInCandidates', input] : ['getWriteInCandidates'];
  },
  useQuery(input?: GetWriteInCandidatesInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInCandidates(input)
    );
  },
} as const;

type GetWriteInImageViewInput = QueryInput<'getWriteInImageView'>;
export const getWriteInImageView = {
  queryKey(input?: GetWriteInImageViewInput): QueryKey {
    return input
      ? ['getWriteInImageView', input.writeInId]
      : ['getWriteInImageView'];
  },
  useQuery(input: GetWriteInImageViewInput, enabled = true) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getWriteInImageView({ writeInId: input.writeInId }),
      { enabled }
    );
  },
} as const;

type GetWriteInAdjudicationContextInput =
  QueryInput<'getWriteInAdjudicationContext'>;
export const getWriteInAdjudicationContext = {
  queryKey(input?: GetWriteInAdjudicationContextInput): QueryKey {
    return input
      ? ['getWriteInAdjudicationContext', input.writeInId]
      : ['getWriteInAdjudicationContext'];
  },
  useQuery(input: GetWriteInAdjudicationContextInput, enabled = true) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () =>
        apiClient.getWriteInAdjudicationContext({ writeInId: input.writeInId }),
      { enabled }
    );
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
  },
} as const;

type GetManualResultsInput = QueryInput<'getManualResults'>;
export const getManualResults = {
  queryKey(input?: GetManualResultsInput): QueryKey {
    return input ? ['getManualResults', input] : ['getManualResults'];
  },
  useQuery(input: GetManualResultsInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getManualResults(input)
    );
  },
} as const;

export const getManualResultsMetadata = {
  queryKey(): QueryKey {
    return ['getManualResultsMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getManualResultsMetadata()
    );
  },
} as const;

type GetCardCountsInput = QueryInput<'getCardCounts'>;
export const getCardCounts = {
  queryKey(input?: GetCardCountsInput): QueryKey {
    return input ? ['getCardCounts', input] : ['getCardCounts'];
  },
  useQuery(
    input: GetCardCountsInput = {},
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getCardCounts(input),
      options
    );
  },
} as const;

export const getScannerBatches = {
  queryKey(): QueryKey {
    return ['getScannerBatches'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getScannerBatches());
  },
} as const;

type GetResultsForTallyReports = QueryInput<'getResultsForTallyReports'>;
export const getResultsForTallyReports = {
  queryKey(input?: GetResultsForTallyReports): QueryKey {
    return input
      ? ['getResultsForTallyReports', input]
      : ['getResultsForTallyReports'];
  },
  useQuery(
    input: GetResultsForTallyReports,
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getResultsForTallyReports(input),
      options
    );
  },
} as const;

export const getElectionWriteInSummary = {
  queryKey(): QueryKey {
    return ['getElectionWriteInSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getElectionWriteInSummary()
    );
  },
} as const;

// Grouped Invalidations

function invalidateCastVoteRecordQueries(queryClient: QueryClient) {
  return Promise.all([
    // cast vote record endpoints
    queryClient.invalidateQueries(getCastVoteRecordFileMode.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecordFiles.queryKey()),

    // scanner batches are generated from cast vote records
    queryClient.invalidateQueries(getScannerBatches.queryKey()),

    // results endpoints relying on cast vote records (all)
    queryClient.invalidateQueries(getCardCounts.queryKey()),
    queryClient.invalidateQueries(getResultsForTallyReports.queryKey()),
    queryClient.invalidateQueries(getElectionWriteInSummary.queryKey()),

    // write-in queues
    queryClient.invalidateQueries(getWriteInAdjudicationQueue.queryKey()),
  ]);
}

function invalidateWriteInQueries(queryClient: QueryClient) {
  const invalidations = [
    // write-in endpoints
    queryClient.invalidateQueries(getWriteInAdjudicationContext.queryKey()),
    queryClient.invalidateQueries(getWriteInCandidates.queryKey()),
    queryClient.invalidateQueries(
      getWriteInAdjudicationQueueMetadata.queryKey()
    ),

    // results endpoints relying on write-ins
    queryClient.invalidateQueries(getResultsForTallyReports.queryKey()),
    queryClient.invalidateQueries(getElectionWriteInSummary.queryKey()),
  ];

  return Promise.all(invalidations);
}

function invalidateManualResultsQueries(queryClient: QueryClient) {
  return Promise.all([
    // manual results queries
    queryClient.invalidateQueries(getManualResults.queryKey()),
    queryClient.invalidateQueries(getManualResultsMetadata.queryKey()),

    // results queries that include manual results
    queryClient.invalidateQueries(getResultsForTallyReports.queryKey()),
    queryClient.invalidateQueries(getCardCounts.queryKey()),
    queryClient.invalidateQueries(getElectionWriteInSummary.queryKey()),
  ]);
}

// Mutations

export const configure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configure, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
      },
    });
  },
} as const;

export const unconfigure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigure, {
      async onSuccess() {
        await queryClient.invalidateQueries();
      },
    });
  },
} as const;

export const markResultsOfficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.markResultsOfficial, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
      },
    });
  },
} as const;

export const clearCastVoteRecordFiles = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.clearCastVoteRecordFiles, {
      async onSuccess() {
        return Promise.all([
          invalidateCastVoteRecordQueries(queryClient),
          invalidateWriteInQueries(queryClient),
          queryClient.invalidateQueries(getCurrentElectionMetadata.queryKey()),
        ]);
      },
    });
  },
} as const;

export const addCastVoteRecordFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addCastVoteRecordFile, {
      async onSuccess() {
        await invalidateCastVoteRecordQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const setManualResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setManualResults, {
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
    return useMutation(apiClient.deleteAllManualResults, {
      async onSuccess() {
        await invalidateManualResultsQueries(queryClient);
        await queryClient.invalidateQueries(getWriteInCandidates.queryKey());
      },
    });
  },
} as const;

export const deleteManualResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteManualResults, {
      async onSuccess() {
        await invalidateManualResultsQueries(queryClient);
        await queryClient.invalidateQueries(getWriteInCandidates.queryKey());
      },
    });
  },
} as const;

export const addWriteInCandidate = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addWriteInCandidate, {
      async onSuccess() {
        await queryClient.invalidateQueries(getWriteInCandidates.queryKey());
      },
    });
  },
} as const;

export const adjudicateWriteIn = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.adjudicateWriteIn, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const exportTallyReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportTallyReportCsv);
  },
} as const;

export const exportBallotCountReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotCountReportCsv);
  },
} as const;

export const exportCdfElectionResultsReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportCdfElectionResultsReport);
  },
} as const;

export const saveElectionPackageToUsb = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveElectionPackageToUsb);
  },
} as const;

export const exportLogsToUsb = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportLogsToUsb);
  },
} as const;
