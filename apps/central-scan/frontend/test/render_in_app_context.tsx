import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogSource, BaseLogger } from '@votingworks/logging';
import {
  type DippedSmartCardAuth,
  constructElectionKey,
  type ElectionDefinition,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import { SystemCallContextProvider, TestErrorBoundary } from '@votingworks/ui';
import { createMemoryHistory, type MemoryHistory } from 'history';
import type React from 'react';
import { Router } from 'react-router-dom';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { render, type RenderResult } from './react_testing_library.js';
import {
  ApiClientContext,
  createQueryClient,
  systemCallApi,
} from '../src/api.js';
import {
  AppContext,
  type AppContextInterface,
} from '../src/contexts/app_context.js';
import type { ApiMock } from './api.js';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: UsbDriveStatus;
  usbDriveEject?: () => void;
  auth?: DippedSmartCardAuth.AuthStatus;
  logger?: BaseLogger;
  apiMock?: ApiMock;
  queryClient?: QueryClient;
}

export function makeAppContext({
  electionDefinition = readElectionGeneralDefinition(),
  electionPackageHash = 'test-election-package-hash',
  isTestMode = false,
  machineConfig = {
    machineId: DEV_MACHINE_ID,
    codeVersion: 'TEST',
  },
  usbDriveStatus = { status: 'no_drive' },
  auth = {
    status: 'logged_in',
    user: mockElectionManagerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
  logger = new BaseLogger(LogSource.VxCentralScanFrontend),
}: Partial<AppContextInterface> = {}): AppContextInterface {
  return {
    electionDefinition,
    electionPackageHash,
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
    machineId = DEV_MACHINE_ID,
    usbDriveStatus,
    auth,
    logger,
    apiMock,
    queryClient = createQueryClient(),
  }: RenderInAppContextParams = {}
): React.ReactElement {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock?.apiClient}>
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
