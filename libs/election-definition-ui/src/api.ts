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
}

export function getElectionInfoQueryKey(electionId: ElectionId): QueryKey {
  return ['getElectionInfo', electionId];
}

function getStateFeaturesQueryKey(electionId: ElectionId): QueryKey {
  return ['getStateFeatures', electionId];
}

function invalidateElectionInfo(
  queryClient: QueryClient,
  electionId: ElectionId
): Promise<void> {
  return queryClient.invalidateQueries(getElectionInfoQueryKey(electionId));
}

function createReactQueryApi(
  getApiClient: () => ElectionDefinitionApiClient,
  {
    invalidateElectionQueries = invalidateElectionInfo,
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
    getStateFeatures: {
      queryKey: getStateFeaturesQueryKey,
      useQuery(electionId: ElectionId) {
        const apiClient = getApiClient();
        return useQuery(getStateFeaturesQueryKey(electionId), () =>
          apiClient.getStateFeatures({ electionId })
        );
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
