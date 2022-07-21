import React, { createContext, RefObject } from 'react';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  DippedSmartcardAuth,
} from '@votingworks/types';
import { usbstick, NullPrinter, Printer } from '@votingworks/utils';
import { Logger, LogSource, LoggingUserRole } from '@votingworks/logging';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
  ConverterClientType,
  CastVoteRecordFile,
} from '../config/types';
import { getEmptyFullElectionTally } from '../lib/votecounting';
import { getEmptyExportableTallies } from '../utils/exportable_tallies';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  printBallotRef?: RefObject<HTMLElement>;
  refreshCastVoteRecordFiles: () => Promise<void>;
  saveElection: SaveElection;
  saveIsOfficialResults: () => Promise<void>;
  resetFiles: (fileType: ResultsFileType) => Promise<void>;
  usbDriveStatus: usbstick.UsbDriveStatus;
  usbDriveEject: (currentUserRole: LoggingUserRole) => Promise<void>;
  addPrintedBallot: (printedBallot: PrintedBallot) => void;
  printedBallots: PrintedBallot[];
  fullElectionTally: FullElectionTally;
  fullElectionExternalTallies: FullElectionExternalTally[];
  isTabulationRunning: boolean;
  setFullElectionTally: React.Dispatch<React.SetStateAction<FullElectionTally>>;
  saveExternalTallies: (
    externalTallies: FullElectionExternalTally[]
  ) => Promise<void>;
  saveTranscribedValue: (
    adjudicationId: string,
    transcribedValue: string
  ) => Promise<void>;
  setIsTabulationRunning: React.Dispatch<React.SetStateAction<boolean>>;
  generateExportableTallies: () => ExportableTallies;
  auth: DippedSmartcardAuth.Auth;
  machineConfig: MachineConfig;
  hasCardReaderAttached: boolean;
  hasPrinterAttached: boolean;
  logger: Logger;
  castVoteRecordFiles: CastVoteRecordFile[];
  importedBallotIds: Set<string>;
}

/* eslint-disable @typescript-eslint/require-await */
const appContext: AppContextInterface = {
  electionDefinition: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  printer: new NullPrinter(),
  printBallotRef: undefined,
  refreshCastVoteRecordFiles: async () => undefined,
  saveElection: async () => undefined,
  saveIsOfficialResults: async () => undefined,
  resetFiles: async () => undefined,
  usbDriveStatus: usbstick.UsbDriveStatus.notavailable,
  usbDriveEject: async () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: [],
  setFullElectionTally: () => undefined,
  saveExternalTallies: async () => undefined,
  saveTranscribedValue: async () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
    bootstrapAuthenticatedElectionManagerSession: () => undefined,
  },
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  logger: new Logger(LogSource.VxAdminFrontend),
  castVoteRecordFiles: [],
  importedBallotIds: new Set(),
};
/* eslint-enable @typescript-eslint/require-await */

export const AppContext = createContext(appContext);
