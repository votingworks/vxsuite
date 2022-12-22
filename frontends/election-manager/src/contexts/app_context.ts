import { createContext } from 'react';
import {
  ConverterClientType,
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  DippedSmartcardAuth,
  FullElectionExternalTallies,
  Printer,
  VotingMethod,
} from '@votingworks/types';
import { NullPrinter, getEmptyFullElectionTally } from '@votingworks/utils';
import { Logger, LogSource, LoggingUserRole } from '@votingworks/logging';
import { UsbDriveStatus } from '@votingworks/ui';
import {
  SaveElection,
  Iso8601Timestamp,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
  ResetElection,
} from '../config/types';
import { getEmptyExportableTallies } from '../utils/exportable_tallies';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  saveElection: SaveElection;
  resetElection: ResetElection;
  resetFiles: (fileType: ResultsFileType) => Promise<void>;
  usbDriveStatus: UsbDriveStatus;
  usbDriveEject: (currentUserRole: LoggingUserRole) => Promise<void>;
  fullElectionTally: FullElectionTally;
  fullElectionExternalTallies: FullElectionExternalTallies;
  isTabulationRunning: boolean;
  updateExternalTally: (
    newExternalTally: FullElectionExternalTally
  ) => Promise<void>;
  manualTallyVotingMethod: VotingMethod;
  setManualTallyVotingMethod: (votingMethod: VotingMethod) => void;
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
  electionDefinition: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  printer: new NullPrinter(),
  saveElection: async () => undefined,
  resetElection: async () => undefined,
  resetFiles: async () => undefined,
  usbDriveStatus: 'absent',
  usbDriveEject: async () => undefined,
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: new Map(),
  updateExternalTally: async () => undefined,
  manualTallyVotingMethod: VotingMethod.Precinct,
  setManualTallyVotingMethod: () => undefined,
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
