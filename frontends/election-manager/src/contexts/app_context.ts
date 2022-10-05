import { createContext, RefObject } from 'react';
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  DippedSmartcardAuth,
  FullElectionExternalTallies,
  Printer,
  VotingMethod,
} from '@votingworks/types';
import { usbstick, NullPrinter } from '@votingworks/utils';
import { Logger, LogSource, LoggingUserRole } from '@votingworks/logging';
import {
  SaveElection,
  PrintedBallot,
  Iso8601Timestamp,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
  ConverterClientType,
  ResetElection,
} from '../config/types';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import { getEmptyFullElectionTally } from '../lib/votecounting';
import { getEmptyExportableTallies } from '../utils/exportable_tallies';
import { AddCastVoteRecordFileResult } from '../lib/backends/types';

export interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles;
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  printBallotRef?: RefObject<HTMLElement>;
  addCastVoteRecordFile: (file: File) => Promise<AddCastVoteRecordFileResult>;
  clearCastVoteRecordFiles: () => Promise<void>;
  saveElection: SaveElection;
  resetElection: ResetElection;
  markResultsOfficial: () => Promise<void>;
  resetFiles: (fileType: ResultsFileType) => Promise<void>;
  usbDriveStatus: usbstick.UsbDriveStatus;
  usbDriveEject: (currentUserRole: LoggingUserRole) => Promise<void>;
  addPrintedBallot: (printedBallot: PrintedBallot) => void;
  printedBallots: readonly PrintedBallot[];
  fullElectionTally: FullElectionTally;
  fullElectionExternalTallies: FullElectionExternalTallies;
  isTabulationRunning: boolean;
  updateExternalTally: (
    newExternalTally: FullElectionExternalTally
  ) => Promise<void>;
  manualTallyVotingMethod: VotingMethod;
  setManualTallyVotingMethod: (votingMethod: VotingMethod) => void;
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
}

/* eslint-disable @typescript-eslint/require-await */
const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  electionDefinition: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  printer: new NullPrinter(),
  printBallotRef: undefined,
  addCastVoteRecordFile: async () => ({
    wasExistingFile: false,
    newlyAdded: 0,
    alreadyPresent: 0,
  }),
  clearCastVoteRecordFiles: async () => undefined,
  saveElection: async () => undefined,
  resetElection: async () => undefined,
  markResultsOfficial: async () => undefined,
  resetFiles: async () => undefined,
  usbDriveStatus: usbstick.UsbDriveStatus.notavailable,
  usbDriveEject: async () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: new Map(),
  updateExternalTally: async () => undefined,
  manualTallyVotingMethod: VotingMethod.Precinct,
  setManualTallyVotingMethod: () => undefined,
  saveTranscribedValue: async () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
  },
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  logger: new Logger(LogSource.VxAdminFrontend),
};
/* eslint-enable @typescript-eslint/require-await */

export const AppContext = createContext(appContext);
