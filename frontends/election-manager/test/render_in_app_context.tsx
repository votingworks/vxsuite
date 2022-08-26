import { createMemoryHistory, MemoryHistory } from 'history';
import React, { RefObject } from 'react';
import { Router } from 'react-router-dom';
import { render as testRender, RenderResult } from '@testing-library/react';

import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  AdjudicationId,
  DippedSmartcardAuth,
} from '@votingworks/types';
import { usbstick, NullPrinter, Printer } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';

import { Dipped } from '@votingworks/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppContext } from '../src/contexts/app_context';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  MachineConfig,
} from '../src/config/types';
import {
  CastVoteRecordFiles,
  SaveCastVoteRecordFiles,
} from '../src/utils/cast_vote_record_files';
import { getEmptyFullElectionTally } from '../src/lib/votecounting';

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
  saveCastVoteRecordFiles?: SaveCastVoteRecordFiles;
  saveElection?: SaveElection;
  saveTranscribedValue?: (
    adjudicationId: AdjudicationId,
    transcribedValue: string
  ) => Promise<void>;
  setCastVoteRecordFiles?: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >;
  saveIsOfficialResults?: () => Promise<void>;
  resetFiles?: () => Promise<void>;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => Promise<void>;
  addPrintedBallot?: (printedBallot: PrintedBallot) => void;
  printedBallots?: PrintedBallot[];
  fullElectionTally?: FullElectionTally;
  isTabulationRunning?: boolean;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  addExternalTally?: (
    externalTally: FullElectionExternalTally
  ) => Promise<void>;
  saveExternalTallies?: (
    externalTallies: FullElectionExternalTally[]
  ) => Promise<void>;
  fullElectionExternalTallies?: FullElectionExternalTally[];
  generateExportableTallies?: () => ExportableTallies;
  auth?: DippedSmartcardAuth.Auth;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
  hasPrinterAttached?: boolean;
  logger?: Logger;
  queryClient?: QueryClient;
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
    saveCastVoteRecordFiles = jest.fn(),
    saveElection = jest.fn(),
    saveIsOfficialResults: markResultsOfficial = jest.fn(),
    resetFiles = jest.fn(),
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    addPrintedBallot = jest.fn(),
    printedBallots = [],
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setIsTabulationRunning = jest.fn(),
    addExternalTally = jest.fn(),
    saveExternalTallies = jest.fn(),
    fullElectionExternalTallies = [],
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
    queryClient = new QueryClient(),
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider
        value={{
          castVoteRecordFiles,
          electionDefinition:
            electionDefinition === 'NONE' ? undefined : electionDefinition,
          configuredAt,
          isOfficialResults,
          printer,
          printBallotRef,
          saveCastVoteRecordFiles,
          saveElection,
          markResultsOfficial,
          resetFiles,
          usbDriveStatus,
          usbDriveEject,
          addPrintedBallot,
          printedBallots,
          fullElectionTally,
          isTabulationRunning,
          setIsTabulationRunning,
          addExternalTally,
          saveExternalTallies,
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
      </AppContext.Provider>
    </QueryClientProvider>
  );
}
