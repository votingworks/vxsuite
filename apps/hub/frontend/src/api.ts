import * as grout from '@votingworks/grout';
import type { Api } from '@votingworks/hub-backend';
import type { ElectionUpload } from '@votingworks/design-backend';
import type { NhStateBallotVariant } from '@votingworks/hmpb';
import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  BallotMode,
  BallotStyleId,
  BallotType,
  ElectionId,
  ElectionSerializationFormat,
  PollingPlaceType,
  PrecinctSelection,
  TtsEditKey,
} from '@votingworks/types';
import {
  type ApiClient as DesignApiClient,
  BACKGROUND_TASK_POLLING_INTERVAL_MS,
  generateId,
  getBallotLayoutSettings,
  getBallotsFinalizedAt,
  getBallotTemplate,
  getElectionInfo,
  useApiClient as useDesignApiClient,
  VXQR_REFETCH_INTERVAL_MS,
} from '@votingworks/design-ui';

export * from '@votingworks/design-ui';

export type ApiClient = grout.Client<Api>;

// @coverage-defer
export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
}

export function asDesignApiClient(apiClient: ApiClient): DesignApiClient {
  return apiClient;
}

function useApiClient(): ApiClient {
  return useDesignApiClient() as unknown as ApiClient;
}

export const listElections = {
  queryKey(): QueryKey {
    return ['design', 'listElections'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listElections());
  },
} as const;

export const loadElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { upload: ElectionUpload; jurisdictionId: string }) =>
        apiClient.loadElection({
          ...input,
          newId: generateId(),
        }),
      {
        async onSuccess(result) {
          if (result.isOk()) {
            await queryClient.invalidateQueries(listElections.queryKey());
          }
        },
      }
    );
  },
} as const;

export const createElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { id: ElectionId; jurisdictionId: string }) =>
        apiClient.createElection(input),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const updateBallotLayoutSettings = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateBallotLayoutSettings, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotLayoutSettings.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const getSystemSettings = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'getSystemSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getSystemSettings({ electionId: id })
    );
  },
} as const;

export const updateSystemSettings = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSystemSettings, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getSystemSettings.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const setBallotTemplate = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setBallotTemplate, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotTemplate.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const getUser = {
  queryKey(): QueryKey {
    return ['getUser'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUser());
  },
} as const;

export const listJurisdictions = {
  queryKey(): QueryKey {
    return ['listJurisdictions'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listJurisdictions());
  },
} as const;

export const getLiveReportsSummary = {
  queryKey(id: ElectionId): QueryKey {
    return ['getLiveReportsSummary', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(id),
      () => apiClient.getLiveReportsSummary({ electionId: id }),
      {
        refetchInterval: VXQR_REFETCH_INTERVAL_MS,
        staleTime: 0,
      }
    );
  },
} as const;

export const getLiveReportsActivityLog = {
  queryKey(id: ElectionId, votingGroup?: PollingPlaceType): QueryKey {
    return ['getLiveReportsActivityLog', id, votingGroup ?? ''];
  },
  useQuery(id: ElectionId, votingGroup?: PollingPlaceType) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(id, votingGroup),
      () =>
        apiClient.getLiveReportsActivityLog({
          electionId: id,
          ...(votingGroup ? { votingGroup } : {}),
        }),
      { refetchInterval: VXQR_REFETCH_INTERVAL_MS, staleTime: 0, cacheTime: 0 }
    );
  },
} as const;

export const getLiveResultsReports = {
  queryKey(id: ElectionId, precinctSelection?: PrecinctSelection): QueryKey {
    if (!precinctSelection) {
      return ['getLiveResultsReports', id];
    }
    return [
      'getLiveResultsReports',
      id,
      precinctSelection.kind === 'AllPrecincts'
        ? ''
        : precinctSelection.precinctId,
    ];
  },
  useQuery(id: ElectionId, precinctSelection: PrecinctSelection) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(id, precinctSelection),
      () =>
        apiClient.getLiveResultsReports({
          electionId: id,
          precinctSelection,
        }),
      { refetchInterval: VXQR_REFETCH_INTERVAL_MS, staleTime: 0, cacheTime: 0 }
    );
  },
} as const;

export const deleteQuickReportingResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteQuickReportingResults, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getLiveResultsReports.queryKey(electionId)
        );
        await queryClient.invalidateQueries(
          getLiveReportsSummary.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const cloneElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { id: ElectionId; jurisdictionId: string }) =>
        apiClient.cloneElection({
          electionId: input.id,
          destElectionId: generateId(),
          destJurisdictionId: input.jurisdictionId,
        }),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const getLatestExportQaRun = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getLatestExportQaRun', electionId];
  },
  useQuery(electionId: ElectionId, options?: { isExportInProgress?: boolean }) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(electionId),
      async () =>
        (await apiClient.getLatestExportQaRun({ electionId })) ?? null,
      {
        // Poll while any QA run is in progress, or while an export is in
        // progress (since a new QA run will be created when the export
        // completes)
        refetchInterval: (latestQaRun) =>
          latestQaRun?.status === 'pending' ||
          latestQaRun?.status === 'in_progress' ||
          options?.isExportInProgress
            ? BACKGROUND_TASK_POLLING_INTERVAL_MS
            : 0,
      }
    );
  },
} as const;

export const getBallotsApprovedAt = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getBallotsApprovedAt', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getBallotsApprovedAt({ electionId })
    );
  },
} as const;

export const approveBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.approveBallots, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotsApprovedAt.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const finalizeBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.finalizeBallots, {
      async onSuccess(_, { electionId }) {
        await Promise.all([
          queryClient.invalidateQueries(
            getBallotsApprovedAt.queryKey(electionId)
          ),
          queryClient.invalidateQueries(
            getBallotsFinalizedAt.queryKey(electionId)
          ),
          queryClient.invalidateQueries(
            getLatestExportQaRun.queryKey(electionId)
          ),
        ]);
      },
    });
  },
} as const;

export const unfinalizeBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unfinalizeBallots, {
      async onSuccess(_, { electionId }) {
        await Promise.all([
          queryClient.invalidateQueries(
            getBallotsApprovedAt.queryKey(electionId)
          ),
          queryClient.invalidateQueries(
            getBallotsFinalizedAt.queryKey(electionId)
          ),
          queryClient.invalidateQueries(
            getLatestExportQaRun.queryKey(electionId)
          ),
        ]);
      },
    });
  },
} as const;

export const getElectionPackage = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getElectionPackage', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(electionId),
      () => apiClient.getElectionPackage({ electionId }),
      {
        // Poll if an export is in progress
        refetchInterval: (result) =>
          result?.task && !result.task.completedAt
            ? BACKGROUND_TASK_POLLING_INTERVAL_MS
            : 0,
      }
    );
  },
} as const;

export const exportElectionPackage = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation(apiClient.exportElectionPackage, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getElectionPackage.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const getTestDecks = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getTestDecks', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(electionId),
      () => apiClient.getTestDecks({ electionId }),
      {
        // Poll if an export is in progress
        refetchInterval: (result) =>
          result?.task && !result.task.completedAt
            ? BACKGROUND_TASK_POLLING_INTERVAL_MS
            : 0,
      }
    );
  },
} as const;

export const exportTestDecks = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation(
      (input: {
        electionId: ElectionId;
        electionSerializationFormat: ElectionSerializationFormat;
      }) => apiClient.exportTestDecks(input),
      {
        async onSuccess(_, { electionId }) {
          await queryClient.invalidateQueries(
            getTestDecks.queryKey(electionId)
          );
        },
      }
    );
  },
} as const;

export const getUserFeatures = {
  queryKey(): QueryKey {
    return ['getUserFeatures'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUserFeatures());
  },
} as const;

export const getResultsReportingUrl = {
  queryKey(): QueryKey {
    return ['getResultsReportingUrl'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getResultsReportingUrl());
  },
} as const;

export const convertMsResults = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.convertMsResults);
  },
} as const;

export const decryptCvrBallotAuditIds = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.decryptCvrBallotAuditIds);
  },
} as const;

export const getBaseUrl = {
  queryKey(): QueryKey {
    return ['getBaseUrl'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getBaseUrl());
  },
} as const;
