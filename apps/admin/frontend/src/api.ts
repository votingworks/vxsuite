import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { Api } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import type { UsbDriveStatus } from '@votingworks/usb-drive';

const PRINTER_STATUS_POLLING_INTERVAL_MS = 100;

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

export const getPrinterStatus = {
  queryKey(): QueryKey {
    return ['getPrinterStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPrinterStatus(), {
      refetchInterval: PRINTER_STATUS_POLLING_INTERVAL_MS,
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

type GetAdjudicationQueueInput = QueryInput<'getAdjudicationQueue'>;
export const getAdjudicationQueue = {
  queryKey(input?: GetAdjudicationQueueInput): QueryKey {
    return input ? ['getAdjudicationQueue', input] : ['getAdjudicationQueue'];
  },
  useQuery(input: GetAdjudicationQueueInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getAdjudicationQueue(input)
    );
  },
} as const;

export const getAdjudicationQueueMetadata = {
  queryKey(): QueryKey {
    return ['getAdjudicationQueueMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getAdjudicationQueueMetadata()
    );
  },
} as const;

type GetNextCvrIdForAdjudicationInput =
  QueryInput<'getNextCvrIdForAdjudication'>;
export const getNextCvrIdForAdjudication = {
  queryKey(input?: GetNextCvrIdForAdjudicationInput): QueryKey {
    return input
      ? ['getNextCvrIdForAdjudication', input]
      : ['getNextCvrIdForAdjudication'];
  },
  useQuery(input: GetNextCvrIdForAdjudicationInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getNextCvrIdForAdjudication(input),
      {
        cacheTime: 0,
      }
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

type GetWriteInsInput = QueryInput<'getWriteIns'>;
export const getWriteIns = {
  queryKey(input?: GetWriteInsInput): QueryKey {
    return input ? ['getWriteIns', input] : ['getWriteIns'];
  },
  useQuery(input?: GetWriteInsInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () =>
        apiClient.getWriteIns({
          cvrId: input?.cvrId,
          contestId: input?.contestId,
        }),
      { enabled: !!input, keepPreviousData: true }
    );
  },
} as const;

type GetBallotImageViewInput = QueryInput<'getBallotImageView'>;
export const getBallotImageView = {
  queryKey(input?: GetBallotImageViewInput): QueryKey {
    return input ? ['getBallotImageView', input] : ['getBallotImageView'];
  },
  useQuery(input?: GetBallotImageViewInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      input
        ? () =>
            apiClient.getBallotImageView({
              cvrId: input.cvrId,
              contestId: input.contestId,
            })
        : /* istanbul ignore next - @preserve */
          () => fail('input is required'),
      { enabled: !!input, keepPreviousData: true }
    );
  },
  usePrefetch() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return (input: GetBallotImageViewInput) =>
      queryClient.prefetchQuery({
        queryKey: getBallotImageView.queryKey(input),
        queryFn: () => apiClient.getBallotImageView(input),
      });
  },
} as const;

type GetCastVoteRecordVoteInfoInput = QueryInput<'getCastVoteRecordVoteInfo'>;
export const getCastVoteRecordVoteInfo = {
  queryKey(input?: GetCastVoteRecordVoteInfoInput): QueryKey {
    return input
      ? ['getCastVoteRecordVoteInfo', input.cvrId]
      : ['getCastVoteRecordVoteInfo'];
  },
  useQuery(input?: GetCastVoteRecordVoteInfoInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      input
        ? () =>
            apiClient.getCastVoteRecordVoteInfo({
              cvrId: input.cvrId,
            }) /* istanbul ignore next - @preserve */
        : () => fail('input is required'),
      { enabled: !!input, keepPreviousData: true }
    );
  },
} as const;

type GetVoteAdjudicationsInput = QueryInput<'getVoteAdjudications'>;
export const getVoteAdjudications = {
  queryKey(input?: GetVoteAdjudicationsInput): QueryKey {
    return input ? ['getVoteAdjudications', input] : ['getVoteAdjudications'];
  },
  useQuery(input?: GetVoteAdjudicationsInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      input
        ? () => apiClient.getVoteAdjudications(input)
        : /* istanbul ignore next - @preserve */
          () => fail('input is required'),
      { enabled: !!input, keepPreviousData: true }
    );
  },
} as const;

type GetMarginalMarksInput = QueryInput<'getMarginalMarks'>;
export const getMarginalMarks = {
  queryKey(input?: GetMarginalMarksInput): QueryKey {
    return input ? ['getMarginalMarks', input] : ['getMarginalMarks'];
  },
  useQuery(input?: GetMarginalMarksInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      input
        ? () => apiClient.getMarginalMarks(input)
        : /* istanbul ignore next - @preserve */
          () => fail('input is required'),
      { enabled: !!input, keepPreviousData: true }
    );
  },
} as const;

type GetCvrContestTagInput = QueryInput<'getCvrContestTag'>;
export const getCvrContestTag = {
  queryKey(input?: GetCvrContestTagInput): QueryKey {
    return input ? ['getCvrContestTag', input] : ['getCvrContestTag'];
  },
  useQuery(input?: GetCvrContestTagInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      input
        ? () => apiClient.getCvrContestTag(input)
        : /* istanbul ignore next - @preserve */
          () => fail('input is required'),
      { enabled: !!input, keepPreviousData: true }
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

export const getTotalBallotCount = {
  queryKey(): QueryKey {
    return ['getTotalBallotCount'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getTotalBallotCount());
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

export const listPotentialElectionPackagesOnUsbDrive = {
  // Refetch if USB drive status changes
  queryKey(usbDriveStatus: UsbDriveStatus): QueryKey {
    return ['listPotentialElectionPackagesOnUsbDrive', usbDriveStatus];
  },
  useQuery(usbDriveStatus: UsbDriveStatus) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(usbDriveStatus),
      () => apiClient.listPotentialElectionPackagesOnUsbDrive(),
      // Don't reuse stale data (e.g. from the last mounted USB drive)
      { staleTime: 0 }
    );
  },
} as const;

type GetTallyReportPreviewInput = QueryInput<'getTallyReportPreview'>;
export const getTallyReportPreview = {
  queryKey(input?: GetTallyReportPreviewInput): QueryKey {
    return input ? ['getTallyReportPreview', input] : ['getTallyReportPreview'];
  },
  useQuery(
    input: GetTallyReportPreviewInput,
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getTallyReportPreview(input),
      // We avoid caching previews because cache invalidation for reports is
      // tricky and therefore risky. The benefit is also minimal because the
      // backend is already caching its most expensive computations.
      {
        cacheTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
        ...options,
      }
    );
  },
} as const;

type GetBallotCountReportPreviewInput =
  QueryInput<'getBallotCountReportPreview'>;
export const getBallotCountReportPreview = {
  queryKey(input?: GetBallotCountReportPreviewInput): QueryKey {
    return input
      ? ['getBallotCountReportPreview', input]
      : ['getBallotCountReportPreview'];
  },
  useQuery(
    input: GetBallotCountReportPreviewInput,
    options: { enabled: boolean } = { enabled: true }
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getBallotCountReportPreview(input),
      // We avoid caching previews because cache invalidation for reports is
      // tricky and therefore risky. The benefit is also minimal because the
      // backend is already caching its most expensive computations.
      {
        cacheTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
        ...options,
      }
    );
  },
} as const;

export const getWriteInAdjudicationReportPreview = {
  queryKey(): QueryKey {
    return ['getWriteInAdjudicationReportPreview'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getWriteInAdjudicationReportPreview(),
      // We avoid caching previews because cache invalidation for reports is
      // tricky and therefore risky. The benefit is also minimal because the
      // backend is already caching its most expensive computations.
      {
        cacheTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      }
    );
  },
} as const;

export const getMostRecentPrinterDiagnostic = {
  queryKey(): QueryKey {
    return ['getDiagnosticRecords'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentPrinterDiagnostic()
    );
  },
} as const;

export const getDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDiskSpaceSummary(), {
      // disk space availability could change between queries for a variety
      // reasons, so always treat it as stale
      staleTime: 0,
    });
  },
} as const;

// Grouped Invalidations

function invalidateCastVoteRecordQueries(queryClient: QueryClient) {
  return Promise.all([
    // cast vote record endpoints
    queryClient.invalidateQueries(getCastVoteRecordFileMode.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecordFiles.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecordVoteInfo.queryKey()),

    // scanner batches are generated from cast vote records
    queryClient.invalidateQueries(getScannerBatches.queryKey()),

    // total ballot count may be affected
    queryClient.invalidateQueries(getTotalBallotCount.queryKey()),

    // write-in queues
    queryClient.invalidateQueries(getAdjudicationQueue.queryKey()),
  ]);
}

function invalidateWriteInQueries(queryClient: QueryClient) {
  const invalidations = [
    queryClient.invalidateQueries(getAdjudicationQueueMetadata.queryKey()),
    queryClient.invalidateQueries(getWriteIns.queryKey()),
    queryClient.invalidateQueries(getWriteInCandidates.queryKey()),
  ];

  return Promise.all(invalidations);
}

function invalidateManualResultsQueries(queryClient: QueryClient) {
  return Promise.all([
    // manual results queries
    queryClient.invalidateQueries(getManualResults.queryKey()),
    queryClient.invalidateQueries(getManualResultsMetadata.queryKey()),

    // total ballot count may be affected
    queryClient.invalidateQueries(getTotalBallotCount.queryKey()),
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
    return useMutation(apiClient.markResultsOfficial, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
      },
    });
  },
} as const;

export const revertResultsToUnofficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.revertResultsToUnofficial, {
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

export const importElectionResultsReportingFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.importElectionResultsReportingFile, {
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

export const adjudicateCvrContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.adjudicateCvrContest, {
      async onSuccess() {
        await queryClient.invalidateQueries(getVoteAdjudications.queryKey());
        await queryClient.invalidateQueries(getCvrContestTag.queryKey());
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const saveElectionPackageToUsb = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveElectionPackageToUsb);
  },
} as const;

export const printTallyReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printTallyReport);
  },
} as const;

export const exportTallyReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportTallyReportPdf);
  },
} as const;

export const exportTallyReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportTallyReportCsv);
  },
} as const;

export const exportCdfElectionResultsReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportCdfElectionResultsReport);
  },
} as const;

export const printBallotCountReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printBallotCountReport);
  },
} as const;

export const exportBallotCountReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotCountReportPdf);
  },
} as const;

export const exportBallotCountReportCsv = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotCountReportCsv);
  },
} as const;

export const printWriteInAdjudicationReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printWriteInAdjudicationReport);
  },
} as const;

export const exportWriteInAdjudicationReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportWriteInAdjudicationReportPdf);
  },
} as const;

export const addDiagnosticRecord = {
  useMutation() {
    const queryClient = useQueryClient();
    const apiClient = useApiClient();
    return useMutation(apiClient.addDiagnosticRecord, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentPrinterDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const printTestPage = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printTestPage);
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveReadinessReport);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
