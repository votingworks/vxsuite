import type {
  AuthErrorCode,
  ElectionDesignApi,
} from '@votingworks/design-backend';
import type { NhStateBallotVariant } from '@votingworks/hmpb';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
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
import { generateId } from './utils.js';
import { useDesignContext } from './design_context.js';

export const BACKGROUND_TASK_POLLING_INTERVAL_MS = 1_000;
export const VXQR_REFETCH_INTERVAL_MS = 1_000;

export type ApiClient = grout.Client<ElectionDesignApi>;

export function useApiClient(): ApiClient {
  return useDesignContext().apiClient;
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
        useErrorBoundary: true,
      },
      mutations: {
        retry: false,
        useErrorBoundary: true,
      },
    },
  });
}

export const getElectionInfo = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'getElectionInfo', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getElectionInfo({ electionId: id })
    );
  },
} as const;

export const listDistricts = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'listDistricts', id];
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
    return ['design', 'listPrecincts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.listPrecincts({ electionId: id })
    );
  },
} as const;

export const listPollingPlaces = {
  queryKey(electionId: string): QueryKey {
    return ['design', 'listPollingPlaces', electionId];
  },
  useQuery(electionId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.listPollingPlaces({ electionId })
    );
  },
} as const;

export const getRegisteredVoterCounts = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'getRegisteredVoterCounts', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getRegisteredVoterCounts({ electionId: id })
    );
  },
} as const;

export const listBallotStyles = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'listBallotStyles', id];
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
    return ['design', 'listParties', id];
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
    return ['design', 'listContests', id];
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
    return ['design', 'getBallotLayoutSettings', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getBallotLayoutSettings({ electionId: id })
    );
  },
} as const;

export const getBallotTemplate = {
  queryKey(id: ElectionId): QueryKey {
    return ['design', 'getBallotTemplate', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getBallotTemplate({ electionId: id })
    );
  },
} as const;

export const ttsEditsGet = {
  queryKey(params: TtsEditKey): QueryKey {
    return [
      'design',
      'ttsEditsGet',
      params.jurisdictionId,
      params.languageCode,
      params.original,
    ];
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

export const ttsStringDefaults = {
  queryKey(electionId: string): QueryKey {
    return ['design', 'ttsStringDefaults', electionId];
  },

  useQuery(electionId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.ttsStringDefaults({ electionId })
    );
  },
} as const;

export const ttsSynthesizeFromText = {
  queryKey(input: { languageCode: string; text: string }): QueryKey {
    return ['design', 'ttsSynthesizeFromText', input.languageCode, input.text];
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
    queryClient.invalidateQueries(['design', 'listElections']),
    queryClient.invalidateQueries(getElectionInfo.queryKey(electionId)),
    queryClient.invalidateQueries(listDistricts.queryKey(electionId)),
    queryClient.invalidateQueries(listPrecincts.queryKey(electionId)),
    queryClient.invalidateQueries(listPollingPlaces.queryKey(electionId)),
    queryClient.invalidateQueries(
      getRegisteredVoterCounts.queryKey(electionId)
    ),
    queryClient.invalidateQueries(listBallotStyles.queryKey(electionId)),
    queryClient.invalidateQueries(listParties.queryKey(electionId)),
    queryClient.invalidateQueries(listContests.queryKey(electionId)),
    queryClient.invalidateQueries(ttsStringDefaults.queryKey(electionId)),
  ]);
}

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

export const updateDistricts = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateDistricts, {
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

export const setPollingPlace = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPollingPlace, {
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
    return useMutation(apiClient.deletePollingPlace, {
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
    return useMutation(apiClient.updateParties, {
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
    return useMutation(apiClient.createContest, {
      async onSuccess(result, { electionId }) {
        // @coverage-defer
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

export const deleteElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(['design', 'listElections'], {
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
    return ['design', 'getBallotsFinalizedAt', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getBallotsFinalizedAt({ electionId })
    );
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
    return ['design', 'getBallotPreviewPdf', input];
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

export const getStateFeatures = {
  queryKey(electionId: ElectionId): QueryKey {
    return ['design', 'getStateFeatures', electionId];
  },
  useQuery(electionId: ElectionId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getStateFeatures({ electionId })
    );
  },
} as const;
