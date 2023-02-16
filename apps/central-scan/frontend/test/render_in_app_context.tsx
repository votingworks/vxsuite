import { render, RenderResult } from '@testing-library/react';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import { UsbDriveStatus } from '@votingworks/ui';
import { MemoryStorage, Storage } from '@votingworks/utils';
import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fakeElectionManagerUser } from '@votingworks/test-utils';
import { ApiClient, ApiClientContext, createQueryClient } from '../src/api';
import { AppContext, AppContextInterface } from '../src/contexts/app_context';
import { createMockApiClient } from './api';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: UsbDriveStatus;
  usbDriveEject?: () => void;
  storage?: Storage;
  auth?: DippedSmartCardAuth.AuthStatus;
  logger?: Logger;
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function makeAppContext({
  electionDefinition = testElectionDefinition,
  machineConfig = {
    machineId: '0000',
    codeVersion: 'TEST',
  },
  usbDriveStatus = 'absent',
  usbDriveEject = jest.fn(),
  storage = new MemoryStorage(),
  auth = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
  },
  logger = new Logger(LogSource.VxCentralScanFrontend),
}: Partial<AppContextInterface> = {}): AppContextInterface {
  return {
    electionDefinition,
    machineConfig,
    usbDriveStatus,
    usbDriveEject,
    storage,
    auth,
    logger,
  };
}

export function wrapInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition,
    machineId = '0000',
    usbDriveStatus,
    usbDriveEject,
    storage,
    auth,
    logger,
    apiClient = createMockApiClient(),
    queryClient = createQueryClient(),
  }: RenderInAppContextParams = {}
): React.ReactElement {
  return (
    <ApiClientContext.Provider value={apiClient}>
      <QueryClientProvider client={queryClient}>
        <AppContext.Provider
          value={makeAppContext({
            electionDefinition,
            machineConfig: { machineId, codeVersion: 'TEST' },
            usbDriveStatus,
            usbDriveEject,
            storage,
            auth,
            logger,
          })}
        >
          <Router history={history}>{component}</Router>
        </AppContext.Provider>
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  params: RenderInAppContextParams = {}
): RenderResult {
  return render(wrapInAppContext(component, params));
}
