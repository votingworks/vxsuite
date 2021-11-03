import { createMemoryHistory, MemoryHistory } from 'history';
import React, { RefObject } from 'react';
import { Router } from 'react-router-dom';
import { sha256 } from 'js-sha256';
import { render as testRender, RenderResult } from '@testing-library/react';

import { electionWithMsEitherNeitherRawData } from '@votingworks/fixtures';
import {
  Election,
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  UserSession,
} from '@votingworks/types';
import { usbstick, NullPrinter, Printer } from '@votingworks/utils';

import { AppContext } from '../src/contexts/AppContext';
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  ExportableTallies,
  MachineConfig,
} from '../src/config/types';
import {
  CastVoteRecordFiles,
  SaveCastVoteRecordFiles,
} from '../src/utils/CastVoteRecordFiles';
import { getEmptyFullElectionTally } from '../src/lib/votecounting';

export const eitherNeitherElectionDefinition = {
  election: JSON.parse(electionWithMsEitherNeitherRawData) as Election,
  electionData: electionWithMsEitherNeitherRawData,
  electionHash: sha256(electionWithMsEitherNeitherRawData),
};

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  castVoteRecordFiles?: CastVoteRecordFiles;
  electionDefinition?: ElectionDefinition;
  configuredAt?: ISO8601Timestamp;
  isOfficialResults?: boolean;
  printer?: Printer;
  printBallotRef?: RefObject<HTMLElement>;
  saveCastVoteRecordFiles?: SaveCastVoteRecordFiles;
  saveElection?: SaveElection;
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
  setFullElectionTally?: React.Dispatch<
    React.SetStateAction<FullElectionTally>
  >;
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>;
  saveExternalTallies?: (
    externalTallies: FullElectionExternalTally[]
  ) => Promise<void>;
  fullElectionExternalTallies?: FullElectionExternalTally[];
  generateExportableTallies?: () => ExportableTallies;
  currentUserSession?: UserSession;
  attemptToAuthenticateAdminUser?: () => boolean;
  lockMachine?: () => undefined;
  machineConfig?: MachineConfig;
  hasCardReaderAttached?: boolean;
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    castVoteRecordFiles = CastVoteRecordFiles.empty,
    electionDefinition = eitherNeitherElectionDefinition,
    configuredAt = '',
    isOfficialResults = false,
    printer = new NullPrinter(),
    printBallotRef = undefined,
    saveCastVoteRecordFiles = jest.fn(),
    saveElection = jest.fn(),
    setCastVoteRecordFiles = jest.fn(),
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
    generateExportableTallies = jest.fn(),
    currentUserSession = { type: 'admin', authenticated: true },
    attemptToAuthenticateAdminUser = jest.fn(),
    lockMachine = jest.fn(),
    machineConfig = {
      machineId: '0000',
      codeVersion: '',
      bypassAuthentication: false,
    },
    hasCardReaderAttached = true,
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        setCastVoteRecordFiles,
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
        currentUserSession,
        attemptToAuthenticateAdminUser,
        lockMachine,
        machineConfig,
        hasCardReaderAttached,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
