import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionManualTally,
  Printer,
  VotingMethod,
  DippedSmartCardAuth,
} from '@votingworks/types';
import {
  NullPrinter,
  getEmptyFullElectionTally,
  randomBallotId,
} from '@votingworks/utils';
import { fakeLogger, Logger, LogSource } from '@votingworks/logging';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fakeElectionManagerUser,
  fakeSessionExpiresAt,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import type { MachineConfig } from '@votingworks/admin-backend';
import { UsbDrive, mockUsbDrive } from '@votingworks/ui';
import { render as testRender, RenderResult } from './react_testing_library';
import { AppContext } from '../src/contexts/app_context';
import { Iso8601Timestamp, ExportableTallies } from '../src/config/types';
import { ServicesContext } from '../src/contexts/services_context';
import { ApiClient, ApiClientContext, createQueryClient } from '../src/api';
import { ApiMock } from './helpers/api_mock';

export const eitherNeitherElectionDefinition =
  electionWithMsEitherNeitherDefinition;

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition | 'NONE';
  configuredAt?: Iso8601Timestamp;
  isOfficialResults?: boolean;
  printer?: Printer;
  usbDrive?: UsbDrive;
  fullElectionTally?: FullElectionTally;
  generateBallotId?: () => string;
  isTabulationRunning?: boolean;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  updateManualTally?: (
    newManualTally: FullElectionManualTally
  ) => Promise<void>;
  manualTallyVotingMethod?: VotingMethod;
  setManualTallyVotingMethod?: (votingMethod: VotingMethod) => void;
  fullElectionManualTally?: FullElectionManualTally;
  generateExportableTallies?: () => ExportableTallies;
  auth?: DippedSmartCardAuth.AuthStatus;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
  apiMock?: ApiMock;
  queryClient?: QueryClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    logger = fakeLogger(),
    // If there's no apiClient given, we don't want to create one by default,
    // since the apiClient needs to have assertComplete called by the test. If
    // the test doesn't need to make API calls, then it should not pass in an
    // apiClient here, which will cause an error if the test tries to make an
    // API call.
    apiClient,
    queryClient = createQueryClient(),
  }: {
    logger?: Logger;
    apiClient?: ApiClient;
    queryClient?: QueryClient;
  } = {}
): RenderResult {
  return testRender(
    <ServicesContext.Provider value={{ logger }}>
      <ApiClientContext.Provider value={apiClient}>
        <QueryClientProvider client={queryClient}>
          {component}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </ServicesContext.Provider>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = eitherNeitherElectionDefinition,
    configuredAt = new Date().toISOString(),
    isOfficialResults = false,
    printer = new NullPrinter(),
    usbDrive = mockUsbDrive(),
    fullElectionTally = getEmptyFullElectionTally(),
    generateBallotId = randomBallotId,
    isTabulationRunning = false,
    setIsTabulationRunning = jest.fn(),
    fullElectionManualTally = undefined,
    generateExportableTallies = jest.fn(),
    auth = electionDefinition === 'NONE'
      ? {
          status: 'logged_in',
          user: fakeSystemAdministratorUser(),
          sessionExpiresAt: fakeSessionExpiresAt(),
          programmableCard: { status: 'no_card' },
        }
      : {
          status: 'logged_in',
          user: fakeElectionManagerUser({
            electionHash: electionDefinition.electionHash,
          }),
          sessionExpiresAt: fakeSessionExpiresAt(),
        },
    machineConfig = {
      machineId: '0000',
      codeVersion: 'dev',
    },
    hasCardReaderAttached = true,
    hasPrinterAttached = true,
    logger = new Logger(LogSource.VxAdminFrontend),
    apiMock,
    queryClient,
  }: RenderInAppContextParams = {}
): RenderResult {
  return renderRootElement(
    <AppContext.Provider
      value={{
        electionDefinition:
          electionDefinition === 'NONE' ? undefined : electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        usbDrive,
        fullElectionTally,
        generateBallotId,
        isTabulationRunning,
        setIsTabulationRunning,
        fullElectionManualTally,
        generateExportableTallies,
        auth,
        machineConfig,
        hasCardReaderAttached,
        hasPrinterAttached,
        logger,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>,
    { apiClient: apiMock?.apiClient, logger, queryClient }
  );
}
