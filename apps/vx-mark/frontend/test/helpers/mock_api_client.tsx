import React from 'react';

import { createMockClient } from '@votingworks/grout-test-utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api, MachineConfig } from '@votingworks/vx-mark-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@votingworks/ui';
import { ApiClientContext } from '../../src/api';
import { fakeMachineConfig } from './fake_machine_config';

/**
 * Creates a VxMark specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockClient<Api>();
  return {
    mockApiClient,

    expectGetMachineConfig(props: Partial<MachineConfig> = {}): void {
      mockApiClient.getMachineConfig
        .expectCallWith()
        .resolves(fakeMachineConfig(props));
    },

    expectGetMachineConfigToError(): void {
      mockApiClient.getMachineConfig.expectCallWith().throws('unexpected_err');
    },
  };
}

export function provideApi(
  apiMock: ReturnType<typeof createApiMock>,
  children: React.ReactNode
): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS })
        }
      >
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
