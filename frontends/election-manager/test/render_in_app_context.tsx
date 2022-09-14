import { createMemoryHistory, MemoryHistory } from 'history';
import React, { RefObject } from 'react';
import { Router } from 'react-router-dom';
import { render as testRender, RenderResult } from '@testing-library/react';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  FullElectionExternalTallies,
  AdjudicationId,
  DippedSmartcardAuth,
} from '@votingworks/types';
import { usbstick, NullPrinter, Printer } from '@votingworks/utils';
import { fakeLogger, Logger, LogSource } from '@votingworks/logging';

import { Dipped } from '@votingworks/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppContext } from '../src/contexts/app_context';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  MachineConfig,
  ResetElection,
} from '../src/config/types';
import { CastVoteRecordFiles } from '../src/utils/cast_vote_record_files';
import { AddCastVoteRecordFileResult } from '../src/lib/backends/types';
import { getEmptyFullElectionTally } from '../src/lib/votecounting';
import { ServicesContext } from '../src/contexts/services_context';
import {
  ElectionManagerStoreBackend,
  ElectionManagerStoreMemoryBackend,
} from '../src/lib/backends';

export const eitherNeitherElectionDefinition =
  electionWithMsEitherNeitherDefinition;

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  castVoteRecordFiles?: CastVoteRecordFiles;
  electionDefinition?: ElectionDefinition | 'NONE';
  configuredAt?: Iso8601Timestamp;
  isOfficialResults?: boolean;
  printer?: Printer;
  printBallotRef?: RefObject<HTMLElement>;
  saveElection?: SaveElection;
  resetElection?: ResetElection;
  saveTranscribedValue?: (
    adjudicationId: AdjudicationId,
    transcribedValue: string
  ) => Promise<void>;
  addCastVoteRecordFile?: (file: File) => Promise<AddCastVoteRecordFileResult>;
  clearCastVoteRecordFiles?: () => Promise<void>;
  saveIsOfficialResults?: () => Promise<void>;
  resetFiles?: () => Promise<void>;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => Promise<void>;
  addPrintedBallot?: (printedBallot: PrintedBallot) => void;
  printedBallots?: PrintedBallot[];
  fullElectionTally?: FullElectionTally;
  isTabulationRunning?: boolean;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  updateExternalTally?: (
    newExternalTally: FullElectionExternalTally
  ) => Promise<void>;
  fullElectionExternalTallies?: FullElectionExternalTallies;
  generateExportableTallies?: () => ExportableTallies;
  auth?: DippedSmartcardAuth.Auth;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
  backend?: ElectionManagerStoreBackend;
  queryClient?: QueryClient;
}

export function renderRootElement(
  component: React.ReactNode,
  {
    backend = new ElectionManagerStoreMemoryBackend(),
    logger = fakeLogger(),
    queryClient = new QueryClient(),
  }: {
    backend?: ElectionManagerStoreBackend;
    logger?: Logger;
    queryClient?: QueryClient;
  } = {}
): RenderResult {
  return testRender(
    <ServicesContext.Provider value={{ backend, logger }}>
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    </ServicesContext.Provider>
  );
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    castVoteRecordFiles = CastVoteRecordFiles.empty,
    electionDefinition = eitherNeitherElectionDefinition,
    configuredAt = new Date().toISOString(),
    isOfficialResults = false,
    printer = new NullPrinter(),
    printBallotRef = undefined,
    addCastVoteRecordFile = jest.fn(),
    clearCastVoteRecordFiles = jest.fn(),
    saveElection = jest.fn(),
    resetElection = jest.fn(),
    saveIsOfficialResults: markResultsOfficial = jest.fn(),
    resetFiles = jest.fn(),
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    addPrintedBallot = jest.fn(),
    printedBallots = [],
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setIsTabulationRunning = jest.fn(),
    updateExternalTally = jest.fn(),
    fullElectionExternalTallies = new Map(),
    saveTranscribedValue = jest.fn(),
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
  }: RenderInAppContextParams = {}
): RenderResult {
  return renderRootElement(
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition:
          electionDefinition === 'NONE' ? undefined : electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        printBallotRef,
        addCastVoteRecordFile,
        clearCastVoteRecordFiles,
        saveElection,
        resetElection,
        markResultsOfficial,
        resetFiles,
        usbDriveStatus,
        usbDriveEject,
        addPrintedBallot,
        printedBallots,
        fullElectionTally,
        isTabulationRunning,
        setIsTabulationRunning,
        updateExternalTally,
        fullElectionExternalTallies,
        generateExportableTallies,
        saveTranscribedValue,
        auth,
        machineConfig,
        hasCardReaderAttached,
        hasPrinterAttached,
        logger,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>,
    { backend, logger, queryClient }
  );
}
