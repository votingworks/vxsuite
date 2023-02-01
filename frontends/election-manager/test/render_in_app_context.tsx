import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { render as testRender, RenderResult } from '@testing-library/react';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  FullElectionExternalTallies,
  DippedSmartcardAuth,
  Printer,
  VotingMethod,
} from '@votingworks/types';
import {
  NullPrinter,
  MemoryStorage,
  Storage,
  getEmptyFullElectionTally,
} from '@votingworks/utils';
import { fakeLogger, Logger, LogSource } from '@votingworks/logging';

import { Dipped } from '@votingworks/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsbDrive } from '@votingworks/ui';
import { AppContext } from '../src/contexts/app_context';
import {
  SaveElection,
  Iso8601Timestamp,
  ExportableTallies,
  MachineConfig,
  ResetElection,
} from '../src/config/types';
import { ServicesContext } from '../src/contexts/services_context';
import {
  ElectionManagerStoreBackend,
  ElectionManagerStoreMemoryBackend,
} from '../src/lib/backends';
import { mockUsbDrive } from './helpers/mock_usb_drive';
import { ApiClient, ApiClientContext } from '../src/api';
import { createMockApiClient } from './helpers/api';

export const eitherNeitherElectionDefinition =
  electionWithMsEitherNeitherDefinition;

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition | 'NONE';
  configuredAt?: Iso8601Timestamp;
  isOfficialResults?: boolean;
  printer?: Printer;
  saveElection?: SaveElection;
  resetElection?: ResetElection;
  resetFiles?: () => Promise<void>;
  usbDrive?: UsbDrive;
  fullElectionTally?: FullElectionTally;
  isTabulationRunning?: boolean;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  updateExternalTally?: (
    newExternalTally: FullElectionExternalTally
  ) => Promise<void>;
  manualTallyVotingMethod?: VotingMethod;
  setManualTallyVotingMethod?: (votingMethod: VotingMethod) => void;
  fullElectionExternalTallies?: FullElectionExternalTallies;
  generateExportableTallies?: () => ExportableTallies;
  auth?: DippedSmartcardAuth.Auth;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
  backend?: ElectionManagerStoreBackend;
  queryClient?: QueryClient;
  apiClient?: ApiClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    backend = new ElectionManagerStoreMemoryBackend(),
    logger = fakeLogger(),
    storage = new MemoryStorage(),
    queryClient = new QueryClient(),
    apiClient = createMockApiClient(),
  }: {
    backend?: ElectionManagerStoreBackend;
    logger?: Logger;
    storage?: Storage;
    queryClient?: QueryClient;
    apiClient?: ApiClient;
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
    saveElection = jest.fn(),
    resetElection = jest.fn(),
    resetFiles = jest.fn(),
    usbDrive = mockUsbDrive(),
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setIsTabulationRunning = jest.fn(),
    updateExternalTally = jest.fn(),
    manualTallyVotingMethod = VotingMethod.Precinct,
    setManualTallyVotingMethod = jest.fn(),
    fullElectionExternalTallies = new Map(),
    generateExportableTallies = jest.fn(),
    auth = Dipped.fakeElectionManagerAuth(),
    machineConfig = {
      machineId: '0000',
      codeVersion: '',
    },
    hasCardReaderAttached = true,
    hasPrinterAttached = true,
    logger = new Logger(LogSource.VxAdminFrontend),
    backend,
    queryClient,
    apiClient,
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
        saveElection,
        resetElection,
        resetFiles,
        usbDrive,
        fullElectionTally,
        isTabulationRunning,
        setIsTabulationRunning,
        updateExternalTally,
        manualTallyVotingMethod,
        setManualTallyVotingMethod,
        fullElectionExternalTallies,
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
    { apiClient, backend, logger, queryClient }
  );
}
