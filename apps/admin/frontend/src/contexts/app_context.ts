import { createContext } from 'react';
import {
  ConverterClientType,
  DippedSmartCardAuth,
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  FullElectionExternalTallies,
  Printer,
  VotingMethod,
} from '@votingworks/types';
import { NullPrinter, getEmptyFullElectionTally } from '@votingworks/shared';
import { Logger, LogSource } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/shared-frontend';
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
  usbDrive: UsbDrive;
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
  auth: DippedSmartCardAuth.AuthStatus;
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
  usbDrive: {
    status: 'absent',
    eject: async () => undefined,
    format: async () => undefined,
  },
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: new Map(),
  updateExternalTally: async () => undefined,
  manualTallyVotingMethod: VotingMethod.Precinct,
  setManualTallyVotingMethod: () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
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
