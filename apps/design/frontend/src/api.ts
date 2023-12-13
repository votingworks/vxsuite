import React from 'react';
import type { Api } from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Id } from '@votingworks/types';

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

export const updateLayoutOptions = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateLayoutOptions, {
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

export const exportAllBallots = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportAllBallots);
  },
} as const;

export const exportBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallot);
  },
} as const;

export const exportElectionPackage = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportElectionPackage);
  },
} as const;
