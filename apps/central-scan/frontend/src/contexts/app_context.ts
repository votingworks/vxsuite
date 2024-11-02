import type { MachineConfig } from '@votingworks/central-scan-backend';
import { LogSource, BaseLogger } from '@votingworks/logging';
import {
  DEV_MACHINE_ID,
  DippedSmartCardAuth,
  ElectionDefinition,
} from '@votingworks/types';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { createContext } from 'react';

export interface AppContextInterface {
  usbDriveStatus: UsbDriveStatus;
  machineConfig: MachineConfig;
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  isTestMode: boolean;
  auth: DippedSmartCardAuth.AuthStatus;
  logger: BaseLogger;
}

const appContext: AppContextInterface = {
  usbDriveStatus: { status: 'no_drive' },
  machineConfig: {
    machineId: DEV_MACHINE_ID,
    codeVersion: '',
  },
  electionDefinition: undefined,
  electionPackageHash: undefined,
  logger: new BaseLogger(LogSource.VxCentralScanFrontend),
  isTestMode: false,
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
  },
};

export const AppContext = createContext(appContext);
