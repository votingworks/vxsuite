import { asMutationFn } from '@votingworks/ui';
import React from 'react';
import {
  Api,
  AuthErrorCode,
  ElectionUpload,
} from '@votingworks/design-backend';
import type { NhStateBallotVariant } from '@votingworks/hmpb';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BallotMode,
  BallotStyleId,
  BallotType,
  ElectionId,
  PollingPlaceType,
  PrecinctSelection,
  TtsEditKey,
} from '@votingworks/types';
import { generateId } from './utils.js';

export const BACKGROUND_TASK_POLLING_INTERVAL_MS = 1_000;
export const VXQR_REFETCH_INTERVAL_MS = 1_000;

export type ApiClient = grout.Client<Api>;

// @coverage-defer
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

export function isApiError(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

export function isAuthError(
  error: unknown
): error is { message: AuthErrorCode } {
  return isApiError(error) && error.message.startsWith('auth');
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // By default, react-query has a staleTime of 0, meaning every time a
        // query is invoked, it will fetch fresh data. This aggressive approach
        // is good for making sure we always show up to date data from the
        // server. However, if multiple components in the same tree use the same
        // query, they will make duplicate requests for the same data when they
        // mount. As a small optimization, we increase the staleTime to 1 second
        // so that multiple components that are mounted simultaneously can use
        // cached data. Note that manual query cache invalidations will override
        // this, so there's no real risk.
        staleTime: 1000,
        retry: (_, error) => !isAuthError(error),
        refetchOnWindowFocus: false,
        // In test, we only want to refetch when we explicitly invalidate. In
        // dev/prod, it's fine to refetch more aggressively.
        refetchOnMount: process.env.NODE_ENV !== 'test',
        throwOnError: true,
      },
      mutations: {
        retry: false,
        throwOnError: true,
      },
    },
  });
}

export const getUser = {
  queryKey(): QueryKey {
    return ['getUser'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getUser(),
    });
  },
} as const;

export const listJurisdictions = {
  queryKey(): QueryKey {
    return ['listJurisdictions'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.listJurisdictions(),
    });
  },
} as const;

export const listElections = {
  queryKey(): QueryKey {
    return ['listElections'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.listElections(),
    });
  },
} as const;

export const getElectionInfo = {
  queryKey(id: ElectionId): QueryKey {
    return ['getElectionInfo', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.getElectionInfo({ electionId: id }),
    });
  },
} as const;

export const getLiveReportsSummary = {
  queryKey(id: ElectionId): QueryKey {
    return ['getLiveReportsSummary', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),
      queryFn: () => apiClient.getLiveReportsSummary({ electionId: id }),
      refetchInterval: VXQR_REFETCH_INTERVAL_MS,
      staleTime: 0,
    });
  },
} as const;

export const getLiveReportsActivityLog = {
  queryKey(id: ElectionId, votingGroup?: PollingPlaceType): QueryKey {
    return ['getLiveReportsActivityLog', id, votingGroup ?? ''];
  },
  useQuery(id: ElectionId, votingGroup?: PollingPlaceType) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id, votingGroup),

      queryFn: () =>
        apiClient.getLiveReportsActivityLog({
          electionId: id,
          ...(votingGroup ? { votingGroup } : {}),
        }),

      refetchInterval: VXQR_REFETCH_INTERVAL_MS,
      staleTime: 0,
      gcTime: 0,
    });
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
    return useQuery({
      queryKey: this.queryKey(id, precinctSelection),

      queryFn: () =>
        apiClient.getLiveResultsReports({
          electionId: id,
          precinctSelection,
        }),

      refetchInterval: VXQR_REFETCH_INTERVAL_MS,
      staleTime: 0,
      gcTime: 0,
    });
  },
} as const;

export const deleteQuickReportingResults = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.deleteQuickReportingResults>[0]
      ) => apiClient.deleteQuickReportingResults(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getLiveResultsReports.queryKey(electionId),
        });
        await queryClient.invalidateQueries({
          queryKey: getLiveReportsSummary.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const listDistricts = {
  queryKey(id: ElectionId): QueryKey {
    return ['listDistricts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.listDistricts({ electionId: id }),
    });
  },
} as const;

export const listPrecincts = {
  queryKey(id: ElectionId): QueryKey {
    return ['listPrecincts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.listPrecincts({ electionId: id }),
    });
  },
} as const;

export const listPollingPlaces = {
  queryKey(electionId: string): QueryKey {
    return ['listPollingPlaces', electionId];
  },
  useQuery(electionId: string) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: () => apiClient.listPollingPlaces({ electionId }),
    });
  },
} as const;

export const getRegisteredVoterCounts = {
  queryKey(id: ElectionId): QueryKey {
    return ['getRegisteredVoterCounts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.getRegisteredVoterCounts({ electionId: id }),
    });
  },
} as const;

export const listBallotStyles = {
  queryKey(id: ElectionId): QueryKey {
    return ['listBallotStyles', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.listBallotStyles({ electionId: id }),
    });
  },
} as const;

export const listParties = {
  queryKey(id: ElectionId): QueryKey {
    return ['listParties', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.listParties({ electionId: id }),
    });
  },
} as const;

export const listContests = {
  queryKey(id: ElectionId): QueryKey {
    return ['listContests', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.listContests({ electionId: id }),
    });
  },
} as const;

export const getBallotLayoutSettings = {
  queryKey(id: ElectionId): QueryKey {
    return ['getBallotLayoutSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.getBallotLayoutSettings({ electionId: id }),
    });
  },
} as const;

export const getSystemSettings = {
  queryKey(id: ElectionId): QueryKey {
    return ['getSystemSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.getSystemSettings({ electionId: id }),
    });
  },
} as const;

export const getBallotTemplate = {
  queryKey(id: ElectionId): QueryKey {
    return ['getBallotTemplate', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(id),

      queryFn: () => apiClient.getBallotTemplate({ electionId: id }),
    });
  },
} as const;

export const ttsEditsGet = {
  queryKey(params: TtsEditKey): QueryKey {
    return [
      'ttsEditsGet',
      params.jurisdictionId,
      params.languageCode,
      params.original,
    ];
  },
  useQuery(params: TtsEditKey, opts: { enabled?: boolean } = {}) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(params),
      queryFn: () => apiClient.ttsEditsGet(params),
      ...opts,
    });
  },
} as const;

export const ttsEditsSet = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.ttsEditsSet>[0]) =>
        apiClient.ttsEditsSet(input),

      onSuccess: (_, params) =>
        queryClient.invalidateQueries({
          queryKey: ttsEditsGet.queryKey(params),
        }),
    });
  },
} as const;

export const ttsStringDefaults = {
  queryKey(electionId: string): QueryKey {
    return ['ttsStringDefaults', electionId];
  },

  useQuery(electionId: string) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: () => apiClient.ttsStringDefaults({ electionId }),
    });
  },
} as const;

export const ttsSynthesizeFromText = {
  queryKey(input: { languageCode: string; text: string }): QueryKey {
    return ['ttsSynthesizeFromText', input.languageCode, input.text];
  },
  useQuery(input: { languageCode: string; text: string }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),

      queryFn: () => apiClient.ttsSynthesizeFromText(input),
    });
  },
} as const;

async function invalidateElectionQueries(
  queryClient: QueryClient,
  electionId: ElectionId
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: listElections.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getElectionInfo.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listDistricts.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listPrecincts.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listPollingPlaces.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: getRegisteredVoterCounts.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listBallotStyles.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listParties.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: listContests.queryKey(electionId),
    }),
    queryClient.invalidateQueries({
      queryKey: ttsStringDefaults.queryKey(electionId),
    }),
  ]);
}

export const loadElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: { upload: ElectionUpload; jurisdictionId: string }) =>
        apiClient.loadElection({
          ...input,
          newId: generateId(),
        }),

      async onSuccess(result) {
        if (result.isOk()) {
          await queryClient.invalidateQueries({
            queryKey: listElections.queryKey(),
          });
        }
      },
    });
  },
} as const;

export const createElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.createElection),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: listElections.queryKey(),
        });
      },
    });
  },
} as const;

export const cloneElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: { id: ElectionId; jurisdictionId: string }) =>
        apiClient.cloneElection({
          electionId: input.id,
          destElectionId: generateId(),
          destJurisdictionId: input.jurisdictionId,
        }),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: listElections.queryKey(),
        });
      },
    });
  },
} as const;

export const updateElectionInfo = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.updateElectionInfo>[0]) =>
        apiClient.updateElectionInfo(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const updateDistricts = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.updateDistricts>[0]) =>
        apiClient.updateDistricts(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const createPrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.createPrecinct>[0]) =>
        apiClient.createPrecinct(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries({
            queryKey: listPrecincts.queryKey(electionId),
          });
        }
      },
    });
  },
} as const;

export const updatePrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.updatePrecinct>[0]) =>
        apiClient.updatePrecinct(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const deletePrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.deletePrecinct>[0]) =>
        apiClient.deletePrecinct(input),

      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const setPollingPlace = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.setPollingPlace>[0]) =>
        apiClient.setPollingPlace(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const deletePollingPlace = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.deletePollingPlace>[0]) =>
        apiClient.deletePollingPlace(input),

      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const updateParties = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.updateParties>[0]) =>
        apiClient.updateParties(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const createContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.createContest>[0]) =>
        apiClient.createContest(input),

      async onSuccess(result, { electionId }) {
        // @coverage-defer
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries({
            queryKey: listContests.queryKey(electionId),
          });
        }
      },
    });
  },
} as const;

export const updateContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.updateContest>[0]) =>
        apiClient.updateContest(input),

      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const reorderContests = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.reorderContests>[0]) =>
        apiClient.reorderContests(input),

      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const deleteContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.deleteContest>[0]) =>
        apiClient.deleteContest(input),

      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const updateBallotLayoutSettings = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.updateBallotLayoutSettings>[0]
      ) => apiClient.updateBallotLayoutSettings(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getBallotLayoutSettings.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const updateSystemSettings = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.updateSystemSettings>[0]
      ) => apiClient.updateSystemSettings(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getSystemSettings.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const deleteElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.deleteElection),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: listElections.queryKey(),
          // Ensure list of elections is refetched in the background so it's
          // fresh when we redirect to elections list
          refetchType: 'all',
        });
      },
    });
  },
} as const;

export const getLatestExportQaRun = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getLatestExportQaRun', electionId];
  },
  useQuery(electionId: ElectionId, options?: { isExportInProgress?: boolean }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: async () =>
        (await apiClient.getLatestExportQaRun({ electionId })) ?? null,

      // Poll while any QA run is in progress, or while an export is in
      // progress (since a new QA run will be created when the export
      // completes)
      refetchInterval: ({ state: { data: latestQaRun } }) =>
        latestQaRun?.status === 'pending' ||
        latestQaRun?.status === 'in_progress' ||
        options?.isExportInProgress
          ? BACKGROUND_TASK_POLLING_INTERVAL_MS
          : 0,
    });
  },
} as const;

export const getBallotsApprovedAt = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getBallotsApprovedAt', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: () => apiClient.getBallotsApprovedAt({ electionId }),
    });
  },
} as const;

export const approveBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.approveBallots>[0]) =>
        apiClient.approveBallots(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getBallotsApprovedAt.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const getBallotsFinalizedAt = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getBallotsFinalizedAt', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: () => apiClient.getBallotsFinalizedAt({ electionId }),
    });
  },
} as const;

export const finalizeBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.finalizeBallots>[0]) =>
        apiClient.finalizeBallots(input),

      async onSuccess(_, { electionId }) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getBallotsApprovedAt.queryKey(electionId),
          }),
          queryClient.invalidateQueries({
            queryKey: getBallotsFinalizedAt.queryKey(electionId),
          }),
          queryClient.invalidateQueries({
            queryKey: getLatestExportQaRun.queryKey(electionId),
          }),
        ]);
      },
    });
  },
} as const;

export const unfinalizeBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.unfinalizeBallots>[0]) =>
        apiClient.unfinalizeBallots(input),

      async onSuccess(_, { electionId }) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getBallotsApprovedAt.queryKey(electionId),
          }),
          queryClient.invalidateQueries({
            queryKey: getBallotsFinalizedAt.queryKey(electionId),
          }),
          queryClient.invalidateQueries({
            queryKey: getLatestExportQaRun.queryKey(electionId),
          }),
        ]);
      },
    });
  },
} as const;

interface GetBallotPreviewInput {
  electionId: ElectionId;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
  variant?: NhStateBallotVariant;
}

export const getBallotPreviewPdf = {
  queryKey(input: GetBallotPreviewInput): QueryKey {
    return ['getBallotPreviewPdf', input];
  },
  useQuery(input: GetBallotPreviewInput) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getBallotPreviewPdf(input),
      staleTime: 0,
      gcTime: 0,
    });
  },
} as const;

export const getElectionPackage = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getElectionPackage', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),
      queryFn: () => apiClient.getElectionPackage({ electionId }),

      // Poll if an export is in progress
      refetchInterval: ({ state: { data: result } }) =>
        result?.task && !result.task.completedAt
          ? BACKGROUND_TASK_POLLING_INTERVAL_MS
          : 0,
    });
  },
} as const;

export const exportElectionPackage = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.exportElectionPackage>[0]
      ) => apiClient.exportElectionPackage(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getElectionPackage.queryKey(electionId),
        });
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
    return useQuery({
      queryKey: this.queryKey(electionId),
      queryFn: () => apiClient.getTestDecks({ electionId }),

      // Poll if an export is in progress
      refetchInterval: ({ state: { data: result } }) =>
        result?.task && !result.task.completedAt
          ? BACKGROUND_TASK_POLLING_INTERVAL_MS
          : 0,
    });
  },
} as const;

export const exportTestDecks = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.exportTestDecks>[0]) =>
        apiClient.exportTestDecks(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getTestDecks.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const setBallotTemplate = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (input: Parameters<typeof apiClient.setBallotTemplate>[0]) =>
        apiClient.setBallotTemplate(input),

      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries({
          queryKey: getBallotTemplate.queryKey(electionId),
        });
      },
    });
  },
} as const;

export const getUserFeatures = {
  queryKey(): QueryKey {
    return ['getUserFeatures'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getUserFeatures(),
    });
  },
} as const;

export const getResultsReportingUrl = {
  queryKey(): QueryKey {
    return ['getResultsReportingUrl'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getResultsReportingUrl(),
    });
  },
} as const;

export const getStateFeatures = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getStateFeatures', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(electionId),

      queryFn: () => apiClient.getStateFeatures({ electionId }),
    });
  },
} as const;

export const convertMsResults = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.convertMsResults),
    });
  },
} as const;

export const decryptCvrBallotAuditIds = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.decryptCvrBallotAuditIds),
    });
  },
} as const;

export const getBaseUrl = {
  queryKey(): QueryKey {
    return ['getBaseUrl'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getBaseUrl(),
    });
  },
} as const;
