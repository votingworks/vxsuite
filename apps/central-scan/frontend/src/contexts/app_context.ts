import type { MachineConfig } from '@votingworks/central-scan-backend';
import { LogSource, Logger } from '@votingworks/logging';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { createContext } from 'react';

export interface AppContextInterface {
  usbDriveStatus: UsbDriveStatus;
  machineConfig: MachineConfig;
  electionDefinition?: ElectionDefinition;
  electionHash?: string;
  isTestMode: boolean;
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
  isTestMode: false,
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
  },
};

export const AppContext = createContext(appContext);
