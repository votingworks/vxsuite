import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  Printer,
  VotingMethod,
  DippedSmartCardAuth,
} from '@votingworks/types';
import {
  NullPrinter,
  MemoryStorage,
  Storage,
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
// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/admin-backend';
import { UsbDrive, mockUsbDrive } from '@votingworks/ui';
import { render as testRender, RenderResult } from './react_testing_library';
import { AppContext } from '../src/contexts/app_context';
import { Iso8601Timestamp, ExportableTallies } from '../src/config/types';
import { ServicesContext } from '../src/contexts/services_context';
import {
  ElectionManagerStoreBackend,
  ElectionManagerStoreMemoryBackend,
} from '../src/lib/backends';
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
  resetFiles?: () => Promise<void>;
  usbDrive?: UsbDrive;
  fullElectionTally?: FullElectionTally;
  generateBallotId?: () => string;
  isTabulationRunning?: boolean;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  updateExternalTally?: (
    newExternalTally: FullElectionExternalTally
  ) => Promise<void>;
  manualTallyVotingMethod?: VotingMethod;
  setManualTallyVotingMethod?: (votingMethod: VotingMethod) => void;
  fullElectionExternalTally?: FullElectionExternalTally;
  generateExportableTallies?: () => ExportableTallies;
  auth?: DippedSmartCardAuth.AuthStatus;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
  backend?: ElectionManagerStoreBackend;
  apiMock?: ApiMock;
  queryClient?: QueryClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    backend = new ElectionManagerStoreMemoryBackend(),
    logger = fakeLogger(),
    storage = new MemoryStorage(),
    // If there's no apiClient given, we don't want to create one by default,
    // since the apiClient needs to have assertComplete called by the test. If
    // the test doesn't need to make API calls, then it should not pass in an
    // apiClient here, which will cause an error if the test tries to make an
    // API call.
    apiClient,
    queryClient = createQueryClient(),
  }: {
    backend?: ElectionManagerStoreBackend;
    logger?: Logger;
    storage?: Storage;
    apiClient?: ApiClient;
    queryClient?: QueryClient;
  } = {}
): RenderResult {
  return testRender(
    <ServicesContext.Provider value={{ backend, logger, storage }}>
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
    resetFiles = jest.fn(),
    usbDrive = mockUsbDrive(),
    fullElectionTally = getEmptyFullElectionTally(),
    generateBallotId = randomBallotId,
    isTabulationRunning = false,
    setIsTabulationRunning = jest.fn(),
    updateExternalTally = jest.fn(),
    manualTallyVotingMethod = VotingMethod.Precinct,
    setManualTallyVotingMethod = jest.fn(),
    fullElectionExternalTally = undefined,
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
    backend,
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
        resetFiles,
        usbDrive,
        fullElectionTally,
        generateBallotId,
        isTabulationRunning,
        setIsTabulationRunning,
        updateExternalTally,
        manualTallyVotingMethod,
        setManualTallyVotingMethod,
        fullElectionExternalTally,
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
    { apiClient: apiMock?.apiClient, backend, logger, queryClient }
  );
}
