import type { RpcApi, StreamApi } from '@votingworks/mark-scan-backend';
import React, { useEffect } from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@votingworks/ui';
import { InsertedSmartCardAuth } from '@votingworks/types';

export type RpcApiClient = grout.RpcClient<RpcApi>;
export type StreamApiClient = grout.StreamClient<StreamApi>;

export function createRpcApiClient(): RpcApiClient {
  return grout.createRpcClient<RpcApi>({ baseUrl: '/api' });
}

export function createStreamApiClient(): StreamApiClient {
  return grout.createStreamClient<StreamApi>({ baseUrl: '/api' });
}

export const RpcApiClientContext = React.createContext<
  RpcApiClient | undefined
>(undefined);

export const StreamApiClientContext = React.createContext<
  StreamApiClient | undefined
>(undefined);

export function useRpcApiClient(): RpcApiClient {
  const apiClient = React.useContext(RpcApiClientContext);
  if (!apiClient) {
    throw new Error('RpcApiClientContext.Provider not found');
  }
  return apiClient;
}

export function useStreamApiClient(): StreamApiClient {
  const apiClient = React.useContext(StreamApiClientContext);
  if (!apiClient) {
    throw new Error('StreamApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useRpcApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getElectionDefinition = {
  queryKey(): QueryKey {
    return ['getElectionDefinition'];
  },
  useQuery() {
    const apiClient = useRpcApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionDefinition());
  },
} as const;

/* istanbul ignore next */
export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useRpcApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
  },
} as const;

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const rpcApiClient = useRpcApiClient();
    const streamApiClient = useStreamApiClient();
    const queryClient = useQueryClient();

    useEffect(() => {
      let authStatusSubscription:
        | grout.Subscription<InsertedSmartCardAuth.AuthStatus>
        | undefined;

      async function poll() {
        authStatusSubscription = streamApiClient.watchAuthStatus();
        for await (const authStatus of authStatusSubscription) {
          queryClient.setQueryData(getAuthStatus.queryKey(), authStatus);
        }
      }

      void poll();

      return () => {
        authStatusSubscription?.unsubscribe();
      };
    }, [queryClient, streamApiClient]);

    return useQuery(this.queryKey(), () => rpcApiClient.getAuthStatus(), {
      // refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
      staleTime: Infinity,
    });
  },
} as const;

export const getScannerReportDataFromCard = {
  queryKey(): QueryKey {
    return ['getScannerReportDataFromCard'];
  },
  useQuery() {
    const apiClient = useRpcApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.readScannerReportDataFromCard(),
      // Don't cache this since caching would require invalidation in response to external
      // circumstances, like card removal
      { cacheTime: 0, staleTime: 0 }
    );
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

/* istanbul ignore next */
export const logOut = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

/* istanbul ignore next */
export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSessionExpiry, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const startCardlessVoterSession = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.startCardlessVoterSession, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const endCardlessVoterSession = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.endCardlessVoterSession, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const clearScannerReportDataFromCard = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.clearScannerReportDataFromCard, {
      async onSuccess() {
        // Because we don't cache scanner report data from cards, this invalidation isn't
        // strictly necessary
        await queryClient.invalidateQueries(
          getScannerReportDataFromCard.queryKey()
        );
      },
    });
  },
} as const;

export const configureBallotPackageFromUsb = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureBallotPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
      },
    });
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useRpcApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.unconfigureMachine(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
      },
    });
  },
} as const;
