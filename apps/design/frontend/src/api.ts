import React from 'react';
import type { Api, BallotMode } from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  BallotStyleId,
  BallotType,
  ElectionId,
  ElectionSerializationFormat,
  Id,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';

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
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // In test, we only want to refetch when we explicitly invalidate. In
        // dev/prod, it's fine to refetch more aggressively.
        refetchOnMount: process.env.NODE_ENV !== 'test',
        useErrorBoundary: true,
      },
      mutations: {
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
export const getAllOrgs = {
  queryKey(): QueryKey {
    return ['getAllOrgs'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAllOrgs());
  },
} as const;

export const listElections = {
  queryKey(): QueryKey {
    return ['listElections'];
  },
  useQuery() {
    const apiClient = useApiClient();
    const user = getUser.useQuery().data;

    return useQuery(
      this.queryKey(),
      () => apiClient.listElections({ user: assertDefined(user) }),
      { enabled: !!user }
    );
  },
} as const;

export const getElection = {
  queryKey(id: Id): QueryKey {
    return ['getElection', id];
  },
  useQuery(id: ElectionId) {
    const apiClient = useApiClient();
    const user = getUser.useQuery().data;

    return useQuery(
      this.queryKey(id),
      () =>
        apiClient.getElection({ electionId: id, user: assertDefined(user) }),
      { enabled: !!user }
    );
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

async function invalidateElectionQueries(
  queryClient: QueryClient,
  electionId: ElectionId
) {
  await queryClient.invalidateQueries(getElection.queryKey(electionId));
  await queryClient.invalidateQueries(getElectionInfo.queryKey(electionId));
  await queryClient.invalidateQueries(listElections.queryKey());
}

export const updateElectionInfo = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateElectionInfo, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const loadElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const user = assertDefined(getUser.useQuery().data);

    return useMutation(
      (input: { electionData: string; orgId: string }) =>
        apiClient.loadElection({ ...input, user }),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const createElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const user = assertDefined(getUser.useQuery().data);

    return useMutation(
      (input: { id: ElectionId; orgId: string }) =>
        apiClient.createElection({ ...input, user }),
      {
        async onSuccess() {
          await queryClient.invalidateQueries(listElections.queryKey());
        },
      }
    );
  },
} as const;

export const updateElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateElection, {
      async onSuccess(_, { electionId }) {
        // Invalidate list, since title/date may have changed
        await queryClient.invalidateQueries(listElections.queryKey(), {
          // Ensure list of elections is refetched in the background so it's
          // fresh when user navigates back to elections list
          refetchType: 'all',
        });
        await invalidateElectionQueries(queryClient, electionId);
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
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const updateBallotOrderInfo = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateBallotOrderInfo, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;

export const updatePrecincts = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updatePrecincts, {
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
      async onSuccess(_, { electionId }) {
        queryClient.removeQueries(getElection.queryKey(electionId));
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
          result?.task && !result.task.completedAt ? 1000 : 0,
      }
    );
  },
} as const;

export const exportElectionPackage = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    const user = assertDefined(getUser.useQuery().data);

    return useMutation(
      (input: {
        electionId: ElectionId;
        electionSerializationFormat: ElectionSerializationFormat;
      }) => apiClient.exportElectionPackage({ ...input, user }),
      {
        async onSuccess(_, { electionId }) {
          await queryClient.invalidateQueries(
            getElectionPackage.queryKey(electionId)
          );
        },
      }
    );
  },
} as const;

export const exportTestDecks = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportTestDecks);
  },
} as const;

export const setBallotTemplate = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setBallotTemplate, {
      async onSuccess(_, { electionId }) {
        await invalidateElectionQueries(queryClient, electionId);
      },
    });
  },
} as const;
