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
import { BallotStyleId, BallotType, Id } from '@votingworks/types';

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

export const listElections = {
  queryKey(): QueryKey {
    return ['listElections'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listElections());
  },
} as const;

export const getElection = {
  queryKey(id: Id): QueryKey {
    return ['getElection', id];
  },
  useQuery(id: Id) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(id), () =>
      apiClient.getElection({ electionId: id })
    );
  },
} as const;

export const loadElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.loadElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(listElections.queryKey());
      },
    });
  },
} as const;

export const createElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.createElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(listElections.queryKey());
      },
    });
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
        await queryClient.invalidateQueries(getElection.queryKey(electionId));
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
        await queryClient.invalidateQueries(getElection.queryKey(electionId));
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
        await queryClient.invalidateQueries(getElection.queryKey(electionId));
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
  queryKey(electionId: Id): QueryKey {
    return ['getBallotsFinalizedAt', electionId];
  },
  useQuery(electionId: Id) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(electionId), () =>
      apiClient.getBallotsFinalizedAt({ electionId })
    );
  },
} as const;

export const setBallotsFinalizedAt = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setBallotsFinalizedAt, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getBallotsFinalizedAt.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const exportAllBallots = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportAllBallots);
  },
} as const;

interface GetBallotPreviewInput {
  electionId: Id;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  ballotMode: BallotMode;
  splitId?: string;
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
  queryKey(electionId: Id): QueryKey {
    return ['getElectionPackage', electionId];
  },
  useQuery(electionId: Id) {
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
    return useMutation(apiClient.exportElectionPackage, {
      async onSuccess(_, { electionId }) {
        await queryClient.invalidateQueries(
          getElectionPackage.queryKey(electionId)
        );
      },
    });
  },
} as const;

export const exportTestDecks = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportTestDecks);
  },
} as const;
