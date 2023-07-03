import { createContext } from 'react';
import {
  ConverterClientType,
  DippedSmartCardAuth,
  ElectionDefinition,
  Printer,
} from '@votingworks/types';
import { NullPrinter } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/ui';
import type { MachineConfig } from '@votingworks/admin-backend';
import { Iso8601Timestamp } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  usbDrive: UsbDrive;
  generateBallotId: () => string;
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
  usbDrive: {
    status: 'absent',
    eject: async () => undefined,
    format: async () => undefined,
  },
  generateBallotId: () => '',
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
