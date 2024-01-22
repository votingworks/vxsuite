import React from 'react';

import { Optional } from '@votingworks/basics';
import { QueryKey, useMutation, useQuery } from '@tanstack/react-query';
import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';

export const BATTERY_POLLING_INTERVAL_GROUT = 3000;

/**
 * `useMutation` only accepts async functions, but some backend system calls
 * are actually `sync` because there's nothing to wait on if we're powering
 * down. This wrapper is simply for typing.
 */
function async(fn: () => void) {
  return () => Promise.resolve(fn());
}

function createReactQueryApi(getApiClient: () => SystemCallApiClient) {
  return {
    reboot: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(async(apiClient.reboot));
      },
    },
    rebootToBios: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(async(apiClient.rebootToBios));
      },
    },
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
      queryKey(): QueryKey {
        return ['getBatteryInfo'];
      },
      useQuery() {
        const apiClient = getApiClient();
        return useQuery(this.queryKey(), () => apiClient.getBatteryInfo(), {
          refetchInterval: BATTERY_POLLING_INTERVAL_GROUT,
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
