import React from 'react';

import { Optional } from '@votingworks/basics';
import { useMutation } from '@tanstack/react-query';
import type { SystemCallApi as SystemCallApiClient } from '@votingworks/backend';

function createReactQueryApi(getApiClient: () => SystemCallApiClient) {
  return {
    exportLogsToUsb: {
      useMutation: () => {
        const apiClient = getApiClient();
        return useMutation(apiClient.exportLogsToUsb);
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
