import { createContext } from 'react';
import {
  ConverterClientType,
  DippedSmartCardAuth,
  ElectionDefinition,
  FullElectionTally,
  FullElectionManualTally,
  Printer,
  VotingMethod,
} from '@votingworks/types';
import { NullPrinter, getEmptyFullElectionTally } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/ui';
import type { MachineConfig } from '@votingworks/admin-backend';
import {
  Iso8601Timestamp,
  ExportableTallies,
  ResultsFileType,
} from '../config/types';
import { getEmptyExportableTallies } from '../utils/exportable_tallies';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  resetFiles: (fileType: ResultsFileType) => Promise<void>;
  usbDrive: UsbDrive;
  fullElectionTally: FullElectionTally;
  fullElectionManualTally?: FullElectionManualTally;
  generateBallotId: () => string;
  isTabulationRunning: boolean;
  updateManualTally: (newManualTally: FullElectionManualTally) => Promise<void>;
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
  resetFiles: async () => undefined,
  usbDrive: {
    status: 'absent',
    eject: async () => undefined,
    format: async () => undefined,
  },
  fullElectionTally: getEmptyFullElectionTally(),
  updateManualTally: async () => undefined,
  manualTallyVotingMethod: VotingMethod.Precinct,
  setManualTallyVotingMethod: () => undefined,
  generateBallotId: () => '',
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
  },
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  logger: new Logger(LogSource.VxAdminFrontend),
};
/* eslint-enable @typescript-eslint/require-await */

export const AppContext = createContext(appContext);
