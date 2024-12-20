import React from 'react';
// import type { Api, BallotMode } from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BallotStyleId, BallotType, Id } from '@votingworks/types';

type Api = {};

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

// export const listElections = {
//   queryKey(): QueryKey {
//     return ['listElections'];
//   },
//   useQuery() {
//     const apiClient = useApiClient();
//     return useQuery(this.queryKey(), () => apiClient.listElections());
//   },
// } as const;

// export const getElection = {
//   queryKey(id: Id): QueryKey {
//     return ['getElection', id];
//   },
//   useQuery(id: Id) {
//     const apiClient = useApiClient();
//     return useQuery(this.queryKey(id), () =>
//       apiClient.getElection({ electionId: id })
//     );
//   },
// } as const;

// export const exportElectionPackage = {
//   useMutation() {
//     const apiClient = useApiClient();
//     const queryClient = useQueryClient();
//     return useMutation(apiClient.exportElectionPackage, {
//       async onSuccess(_, { electionId }) {
//         await queryClient.invalidateQueries(
//           getElectionPackage.queryKey(electionId)
//         );
//       },
//     });
//   },
// } as const;
