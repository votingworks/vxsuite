import {
  type QueryClient,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ElectionDefinitionMethods } from '@votingworks/election-definition-backend';
import type * as grout from '@votingworks/grout';
import type { ElectionId } from '@votingworks/types';

export type ElectionDefinitionApi = grout.Api<
  Pick<ElectionDefinitionMethods, keyof ElectionDefinitionMethods>
>;

export type ElectionDefinitionApiClient = grout.Client<ElectionDefinitionApi>;

export interface ElectionDefinitionApiOptions {
  invalidateElectionQueries?: (
    queryClient: QueryClient,
    electionId: ElectionId
  ) => Promise<void>;
  invalidateElectionListQueries?: (queryClient: QueryClient) => Promise<void>;
}

export function getElectionInfoQueryKey(electionId: ElectionId): QueryKey {
  return ['getElectionInfo', electionId];
}

function getStateFeaturesQueryKey(electionId: ElectionId): QueryKey {
  return ['getStateFeatures', electionId];
}

export function listDistrictsQueryKey(electionId: ElectionId): QueryKey {
  return ['listDistricts', electionId];
}

export function listPartiesQueryKey(electionId: ElectionId): QueryKey {
  return ['listParties', electionId];
}

export function listContestsQueryKey(electionId: ElectionId): QueryKey {
  return ['listContests', electionId];
}

export function listPrecinctsQueryKey(electionId: ElectionId): QueryKey {
  return ['listPrecincts', electionId];
}

export function getRegisteredVoterCountsQueryKey(
  electionId: ElectionId
): QueryKey {
  return ['getRegisteredVoterCounts', electionId];
}

export function listPollingPlacesQueryKey(electionId: ElectionId): QueryKey {
  return ['listPollingPlaces', electionId];
}

async function invalidateElectionDefinitionQueries(
  queryClient: QueryClient,
  electionId: ElectionId
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries(getElectionInfoQueryKey(electionId)),
    queryClient.invalidateQueries(listDistrictsQueryKey(electionId)),
    queryClient.invalidateQueries(listPartiesQueryKey(electionId)),
    queryClient.invalidateQueries(listContestsQueryKey(electionId)),
    queryClient.invalidateQueries(listPrecinctsQueryKey(electionId)),
    queryClient.invalidateQueries(getRegisteredVoterCountsQueryKey(electionId)),
    queryClient.invalidateQueries(listPollingPlacesQueryKey(electionId)),
  ]);
}

function createReactQueryApi(
  getApiClient: () => ElectionDefinitionApiClient,
  {
    invalidateElectionQueries = invalidateElectionDefinitionQueries,
    invalidateElectionListQueries,
  }: ElectionDefinitionApiOptions
) {
  return {
    getElectionInfo: {
      queryKey: getElectionInfoQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(getElectionInfoQueryKey(electionId), () =>
          apiClient.getElectionInfo({ electionId })
        );
      },
    },
    updateElectionInfo: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.updateElectionInfo, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    deleteElection: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.deleteElection, {
          async onSuccess() {
            await invalidateElectionListQueries?.(queryClient);
          },
        });
      },
    },
    getStateFeatures: {
      queryKey: getStateFeaturesQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(getStateFeaturesQueryKey(electionId), () =>
          apiClient.getStateFeatures({ electionId })
        );
      },
    },
    listDistricts: {
      queryKey: listDistrictsQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(listDistrictsQueryKey(electionId), () =>
          apiClient.listDistricts({ electionId })
        );
      },
    },
    updateDistricts: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.updateDistricts, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    listParties: {
      queryKey: listPartiesQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(listPartiesQueryKey(electionId), () =>
          apiClient.listParties({ electionId })
        );
      },
    },
    updateParties: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.updateParties, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    listContests: {
      queryKey: listContestsQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(listContestsQueryKey(electionId), () =>
          apiClient.listContests({ electionId })
        );
      },
    },
    createContest: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.createContest, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
              await queryClient.refetchQueries(
                listContestsQueryKey(electionId)
              );
            }
          },
        });
      },
    },
    updateContest: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.updateContest, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    reorderContests: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.reorderContests, {
          async onSuccess(_, { electionId }) {
            await invalidateElectionQueries(queryClient, electionId);
          },
        });
      },
    },
    deleteContest: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.deleteContest, {
          async onSuccess(_, { electionId }) {
            await invalidateElectionQueries(queryClient, electionId);
          },
        });
      },
    },
    listPrecincts: {
      queryKey: listPrecinctsQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(listPrecinctsQueryKey(electionId), () =>
          apiClient.listPrecincts({ electionId })
        );
      },
    },
    getRegisteredVoterCounts: {
      queryKey: getRegisteredVoterCountsQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(getRegisteredVoterCountsQueryKey(electionId), () =>
          apiClient.getRegisteredVoterCounts({ electionId })
        );
      },
    },
    createPrecinct: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.createPrecinct, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
              await queryClient.refetchQueries(
                listPrecinctsQueryKey(electionId)
              );
            }
          },
        });
      },
    },
    updatePrecinct: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.updatePrecinct, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    deletePrecinct: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.deletePrecinct, {
          async onSuccess(_, { electionId }) {
            await invalidateElectionQueries(queryClient, electionId);
          },
        });
      },
    },
    listPollingPlaces: {
      queryKey: listPollingPlacesQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(listPollingPlacesQueryKey(electionId), () =>
          apiClient.listPollingPlaces({ electionId })
        );
      },
    },
    setPollingPlace: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.setPollingPlace, {
          async onSuccess(result, { electionId }) {
            if (result.isOk()) {
              await invalidateElectionQueries(queryClient, electionId);
            }
          },
        });
      },
    },
    deletePollingPlace: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.deletePollingPlace, {
          async onSuccess(_, { electionId }) {
            await invalidateElectionQueries(queryClient, electionId);
          },
        });
      },
    },
  };
}

export type ElectionDefinitionReactQueryApi = ReturnType<
  typeof createReactQueryApi
>;

export function createElectionDefinitionApi(
  getApiClient: () => ElectionDefinitionApiClient,
  options: ElectionDefinitionApiOptions = {}
): ElectionDefinitionReactQueryApi {
  return createReactQueryApi(getApiClient, options);
}
