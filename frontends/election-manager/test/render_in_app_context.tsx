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
import { AppContext } from '../src/contexts/app_context';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  MachineConfig,
  CastVoteRecordFile,
} from '../src/config/types';
import { getEmptyFullElectionTally } from '../src/lib/votecounting';

export const eitherNeitherElectionDefinition =
  electionWithMsEitherNeitherDefinition;

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  castVoteRecordFiles?: CastVoteRecordFile[];
  importedBallotIds?: Set<string>;
  electionDefinition?: ElectionDefinition | 'NONE';
  configuredAt?: Iso8601Timestamp;
  isOfficialResults?: boolean;
  printer?: Printer;
  printBallotRef?: RefObject<HTMLElement>;
  refreshCastVoteRecordFiles?: () => Promise<void>;
  saveElection?: SaveElection;
  saveTranscribedValue?: (
    adjudicationId: AdjudicationId,
    transcribedValue: string
  ) => Promise<void>;
  saveIsOfficialResults?: () => Promise<void>;
  resetFiles?: () => Promise<void>;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => Promise<void>;
  addPrintedBallot?: (printedBallot: PrintedBallot) => void;
  printedBallots?: PrintedBallot[];
  fullElectionTally?: FullElectionTally;
  isTabulationRunning?: boolean;
  setFullElectionTally?: React.Dispatch<
    React.SetStateAction<FullElectionTally>
  >;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
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
    printBallotRef = undefined,
    refreshCastVoteRecordFiles = jest.fn(),
    castVoteRecordFiles = [],
    importedBallotIds = new Set(),
    saveElection = jest.fn(),
    saveIsOfficialResults = jest.fn(),
    resetFiles = jest.fn(),
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    addPrintedBallot = jest.fn(),
    printedBallots = [],
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setFullElectionTally = jest.fn(),
    setIsTabulationRunning = jest.fn(),
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
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        electionDefinition:
          electionDefinition === 'NONE' ? undefined : electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        printBallotRef,
        refreshCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        resetFiles,
        usbDriveStatus,
        usbDriveEject,
        addPrintedBallot,
        printedBallots,
        fullElectionTally,
        isTabulationRunning,
        setFullElectionTally,
        setIsTabulationRunning,
        saveExternalTallies,
        fullElectionExternalTallies,
        generateExportableTallies,
        saveTranscribedValue,
        auth,
        machineConfig,
        hasCardReaderAttached,
        hasPrinterAttached,
        logger,
        castVoteRecordFiles,
        importedBallotIds,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
