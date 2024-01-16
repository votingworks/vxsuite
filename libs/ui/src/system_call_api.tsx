import React from 'react';

import { Optional } from '@votingworks/basics';
import { useMutation } from '@tanstack/react-query';
import { SystemCallApi } from '@votingworks/types';
import * as grout from '@votingworks/grout';

// Unable to use `grout.Client<SystemCallApi>` directly due to some mismatched
// type inference with `grout.AnyMethods`, so copying the `grout.Client`
// definition here for now:
export type SystemCallApiClient = {
  [Method in keyof SystemCallApi]: grout.AsyncRpcMethod<SystemCallApi[Method]>;
};

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
