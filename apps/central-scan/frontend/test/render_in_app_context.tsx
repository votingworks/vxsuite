import { electionGeneralDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import { SystemCallContextProvider, TestErrorBoundary } from '@votingworks/ui';
import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render, RenderResult } from './react_testing_library';
import {
  ApiClient,
  ApiClientContext,
  createQueryClient,
  systemCallApi,
} from '../src/api';
import { AppContext, AppContextInterface } from '../src/contexts/app_context';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: UsbDriveStatus;
  usbDriveEject?: () => void;
  auth?: DippedSmartCardAuth.AuthStatus;
  logger?: Logger;
  apiClient?: ApiClient;
  queryClient?: QueryClient;
}

export function makeAppContext({
  electionDefinition = testElectionDefinition,
  isTestMode = false,
  machineConfig = {
    machineId: '0000',
    codeVersion: 'TEST',
  },
  usbDriveStatus = { status: 'no_drive' },
  auth = {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  },
  logger = new Logger(LogSource.VxCentralScanFrontend),
}: Partial<AppContextInterface> = {}): AppContextInterface {
  return {
    electionDefinition,
    isTestMode,
    machineConfig,
    usbDriveStatus,
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
    auth,
    logger,
    apiClient,
    queryClient = createQueryClient(),
  }: RenderInAppContextParams = {}
): React.ReactElement {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          <SystemCallContextProvider api={systemCallApi}>
            <AppContext.Provider
              value={makeAppContext({
                electionDefinition,
                machineConfig: { machineId, codeVersion: 'TEST' },
                usbDriveStatus,
                auth,
                logger,
              })}
            >
              <Router history={history}>{component}</Router>
            </AppContext.Provider>
          </SystemCallContextProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  params: RenderInAppContextParams = {}
): RenderResult {
  return render(wrapInAppContext(component, params));
}
