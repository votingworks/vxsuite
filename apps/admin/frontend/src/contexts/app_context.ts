import { createContext } from 'react';
import {
  ConverterClientType,
  DippedSmartCardAuth,
  ElectionDefinition,
  Printer,
} from '@votingworks/types';
import { NullPrinter } from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';
import type { MachineConfig } from '@votingworks/admin-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { Iso8601Timestamp } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  converter?: ConverterClientType;
  isOfficialResults: boolean;
  printer: Printer;
  usbDriveStatus: UsbDriveStatus;
  generateBallotId: () => string;
  auth: DippedSmartCardAuth.AuthStatus;
  machineConfig: MachineConfig;
  hasCardReaderAttached: boolean;
  logger: Logger;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  printer: new NullPrinter(),
  usbDriveStatus: mockUsbDriveStatus('no_drive'),
  generateBallotId: () => '',
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
  },
  hasCardReaderAttached: true,
  logger: new Logger(LogSource.VxAdminFrontend),
};
/* eslint-enable @typescript-eslint/require-await */

export const AppContext = createContext(appContext);
