import React from 'react';

import { Optional } from '@votingworks/basics';
import {
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SystemCallApiMethods } from '@votingworks/backend';
import * as grout from '@votingworks/grout';

export const BATTERY_POLLING_INTERVAL_GROUT = 3000;
export const AUDIO_INFO_POLLING_INTERVAL_MS = 1000;

/**
 * `useMutation` only accepts async functions, but some backend system calls
 * are actually `sync` because there's nothing to wait on if we're powering
 * down. This wrapper is simply for typing.
 */
function async(fn: () => void) {
  return () => Promise.resolve(fn());
}

type SystemCallApiClient = grout.Client<grout.Api<SystemCallApiMethods>>;

function createReactQueryApi(getApiClient: () => SystemCallApiClient) {
  const getUsbPortStatusQueryKey: QueryKey = ['getUsbPortStatus'];
  return {
    powerDown: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(async(apiClient.powerDown));
      },
    },
    setClock: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(apiClient.setClock);
      },
    },
    exportLogsToUsb: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(apiClient.exportLogsToUsb);
      },
    },
    getBatteryInfo: {
      useQuery() {
        const apiClient = getApiClient();
        return useQuery(['getBatteryInfo'], () => apiClient.getBatteryInfo(), {
          refetchInterval: BATTERY_POLLING_INTERVAL_GROUT,
        });
      },
    },
    getAudioInfo: {
      useQuery() {
        const apiClient = getApiClient();
        return useQuery(['getAudioInfo'], () => apiClient.getAudioInfo(), {
          refetchInterval: AUDIO_INFO_POLLING_INTERVAL_MS,
        });
      },
    },
    getUsbPortStatus: {
      useQuery() {
        const apiClient = getApiClient();
        return useQuery(getUsbPortStatusQueryKey, () =>
          apiClient.getUsbPortStatus()
        );
      },
    },
    toggleUsbPorts: {
      useMutation() {
        const apiClient = getApiClient();
        const queryClient = useQueryClient();
        return useMutation(apiClient.toggleUsbPorts, {
          async onSuccess() {
            await queryClient.invalidateQueries(getUsbPortStatusQueryKey);
          },
        });
      },
    },
  };
}

export type SystemCallReactQueryApi = ReturnType<typeof createReactQueryApi>;

export function createSystemCallApi(
  getApiClient: () => SystemCallApiClient
): SystemCallReactQueryApi {
  return createReactQueryApi(getApiClient);
}

export interface SystemCallContextInterface {
  api: SystemCallReactQueryApi;
}

export const SystemCallContext =
  React.createContext<Optional<SystemCallContextInterface>>(undefined);

export function useSystemCallApi(): SystemCallReactQueryApi {
  const context = React.useContext(SystemCallContext);
  if (context === undefined) {
    throw new Error('the SystemCall API was not provided');
  }
  return context.api;
}

export interface SystemCallContextProviderProps {
  api: SystemCallReactQueryApi;
  children: React.ReactNode;
}

export function SystemCallContextProvider(
  props: SystemCallContextProviderProps
): React.ReactNode {
  const { api, children } = props;

  return (
    <SystemCallContext.Provider value={{ api }}>
      {children}
    </SystemCallContext.Provider>
  );
}
