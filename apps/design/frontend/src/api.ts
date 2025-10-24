import React from 'react';
import { Api, AuthErrorCode } from '@votingworks/design-backend';
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
  ElectionSerializationFormat,
  PrecinctSelection,
  TtsEditKey,
} from '@votingworks/types';
import { generateId } from './utils';

export const BACKGROUND_TASK_POLLING_INTERVAL_MS = 1_000;
export const VXQR_REFETCH_INTERVAL_MS = 1_000;

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
        retry: (_, error) => !isAuthError(error),
        refetchOnWindowFocus: false,
        // In test, we only want to refetch when we explicitly invalidate. In
        // dev/prod, it's fine to refetch more aggressively.
        refetchOnMount: process.env.NODE_ENV !== 'test',
        useErrorBoundary: true,
      },
      mutations: {
        retry: false,
        useErrorBoundary: true,
      },
    },
  });
}

/* istanbul ignore next - @preserve */
export const getUser = {
  queryKey(): QueryKey {
    return ['getUser'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUser());
  },
} as const;

/* istanbul ignore next - @preserve */
export const listOrganizations = {
  queryKey(): QueryKey {
    return ['listOrganizations'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listOrganizations());
  },
} as const;

export const listElections = {
  queryKey(): QueryKey {
    return ['listElections'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listElections());
  },
} as const;

export const getElectionInfo = {
  queryKey(id: ElectionId): QueryKey {
    return ['getElectionInfo', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getElectionInfo({ electionId: id })
    );
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
      () =>
        apiClient.getLiveReportsSummary({
          electionId: id,
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

export const listDistricts = {
  queryKey(id: ElectionId): QueryKey {
    return ['listDistricts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listDistricts({ electionId: id })
    );
  },
} as const;

export const listPrecincts = {
  queryKey(id: ElectionId): QueryKey {
    return ['listPrecincts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listPrecincts({ electionId: id })
    );
  },
} as const;

export const listBallotStyles = {
  queryKey(id: ElectionId): QueryKey {
    return ['listBallotStyles', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listBallotStyles({ electionId: id })
    );
  },
} as const;

export const listParties = {
  queryKey(id: ElectionId): QueryKey {
    return ['listParties', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listParties({ electionId: id })
    );
  },
} as const;

export const listContests = {
  queryKey(id: ElectionId): QueryKey {
    return ['listContests', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listContests({ electionId: id })
    );
  },
} as const;

export const getBallotLayoutSettings = {
  queryKey(id: ElectionId): QueryKey {
    return ['getBallotLayoutSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getBallotLayoutSettings({ electionId: id })
    );
  },
} as const;

export const getSystemSettings = {
  queryKey(id: ElectionId): QueryKey {
    return ['getSystemSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getSystemSettings({ electionId: id })
    );
  },
} as const;

export const getBallotTemplate = {
  queryKey(id: ElectionId): QueryKey {
    return ['getBallotTemplate', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getBallotTemplate({ electionId: id })
    );
  },
} as const;

/* istanbul ignore next - WIP @preserve */
export const ttsEditsGet = {
  queryKey(params: TtsEditKey): QueryKey {
    return ['ttsEditsGet', params.orgId, params.languageCode, params.original];
  },
  useQuery(params: TtsEditKey, opts: { enabled?: boolean } = {}) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(params),
      () => apiClient.ttsEditsGet(params),
      opts
    );
  },
} as const;

/* istanbul ignore next - WIP @preserve */
export const ttsEditsSet = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    return useMutation(apiClient.ttsEditsSet, {
      onSuccess: (_, params) =>
        queryClient.invalidateQueries(ttsEditsGet.queryKey(params)),
    });
  },
} as const;

/* istanbul ignore next - WIP @preserve */
export const ttsStringDefaults = {
  queryKey(electionId: string): QueryKey {
    return ['ttsStringDefaults', electionId];
  },

  useQuery(electionId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.ttsStringDefaults({ electionId })
    );
  },
} as const;

/* istanbul ignore next - WIP @preserve */
export const ttsSynthesizeFromText = {
  queryKey(input: { languageCode: string; text: string }): QueryKey {
    return ['ttsSynthesizeFromText', input.languageCode, input.text];
  },
  useQuery(input: { languageCode: string; text: string }) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.ttsSynthesizeFromText(input)
    );
  },
} as const;

async function invalidateElectionQueries(
  queryClient: QueryClient,
  electionId: ElectionId
) {
  await Promise.all([
    queryClient.invalidateQueries(listElections.queryKey()),
    queryClient.invalidateQueries(getElectionInfo.queryKey(electionId)),
    queryClient.invalidateQueries(listDistricts.queryKey(electionId)),
    queryClient.invalidateQueries(listPrecincts.queryKey(electionId)),
    queryClient.invalidateQueries(listBallotStyles.queryKey(electionId)),
    queryClient.invalidateQueries(listParties.queryKey(electionId)),
    queryClient.invalidateQueries(listContests.queryKey(electionId)),
    queryClient.invalidateQueries(ttsStringDefaults.queryKey(electionId)),
  ]);
}

export const loadElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { electionData: string; orgId: string }) =>
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
      (input: { id: ElectionId; orgId: string }) =>
        apiClient.createElection(input),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const cloneElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { id: ElectionId; orgId: string }) =>
        apiClient.cloneElection({
          electionId: input.id,
          destElectionId: generateId(),
          destOrgId: input.orgId,
        }),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const updateElectionInfo = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateElectionInfo, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const createDistrict = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createDistrict, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries(listDistricts.queryKey(electionId));
        }
      },
    });
  },
} as const;

export const updateDistrict = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateDistrict, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const deleteDistrict = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteDistrict, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const createPrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createPrecinct, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries(listPrecincts.queryKey(electionId));
        }
      },
    });
  },
} as const;

export const updatePrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updatePrecinct, {
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
    return useMutation(apiClient.deletePrecinct, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const createParty = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createParty, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries(listParties.queryKey(electionId));
        }
      },
    });
  },
} as const;

export const updateParty = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateParty, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
        }
      },
    });
  },
} as const;

export const deleteParty = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteParty, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const createContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createContest, {
      async onSuccess(result, { electionId }) {
        if (result.isOk()) {
          await invalidateElectionQueries(queryClient, electionId);
          await queryClient.refetchQueries(listContests.queryKey(electionId));
        }
      },
    });
  },
} as const;

export const updateContest = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateContest, {
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
    return useMutation(apiClient.reorderContests, {
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
    return useMutation(apiClient.deleteContest, {
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
    return useMutation(apiClient.updateBallotLayoutSettings, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotLayoutSettings.queryKey(electionId)
        );
      },
    });
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

export const deleteElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(listElections.queryKey(), {
          // Ensure list of elections is refetched in the background so it's
          // fresh when we redirect to elections list
          refetchType: 'all',
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
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getBallotsFinalizedAt({ electionId })
    );
  },
} as const;

export const finalizeBallots = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.finalizeBallots, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotsFinalizedAt.queryKey(electionId)
        );
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
        await queryClient.invalidateQueries(
          getBallotsFinalizedAt.queryKey(electionId)
        );
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
}

export const getBallotPreviewPdf = {
  queryKey(input: GetBallotPreviewInput): QueryKey {
    return ['getBallotPreviewPdf', input];
  },
  useQuery(input: GetBallotPreviewInput) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getBallotPreviewPdf(input),
      // Never cache PDFs, that way we don't have to worry about invalidating them
      { staleTime: 0, cacheTime: 0 }
    );
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

export const getUserFeatures = {
  queryKey(): QueryKey {
    return ['getUserFeatures'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUserFeatures());
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

export const getElectionFeatures = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['getElectionFeatures', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getElectionFeatures({ electionId })
    );
  },
} as const;

export const decryptCvrBallotAuditIds = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.decryptCvrBallotAuditIds);
  },
} as const;
