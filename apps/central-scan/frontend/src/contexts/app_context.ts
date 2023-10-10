import { LogSource, Logger } from '@votingworks/logging';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  usbDriveStatus: UsbDriveStatus;
  machineConfig: MachineConfig;
  electionDefinition?: ElectionDefinition;
  electionHash?: string;
  auth: DippedSmartCardAuth.AuthStatus;
  logger: Logger;
}

const appContext: AppContextInterface = {
  usbDriveStatus: { status: 'no_drive' },
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  electionDefinition: undefined,
  electionHash: undefined,
  logger: new Logger(LogSource.VxCentralScanFrontend),
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
  },
};

export const AppContext = createContext(appContext);
