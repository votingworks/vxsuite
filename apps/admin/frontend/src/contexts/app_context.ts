import { createContext } from 'react';
import {
  DEV_MACHINE_ID,
  DippedSmartCardAuth,
  ElectionDefinition,
} from '@votingworks/types';
import type { MachineConfig } from '@votingworks/admin-backend';
import type { UsbDriveInfo } from '@votingworks/usb-drive';
import { Iso8601Timestamp } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  configuredAt?: Iso8601Timestamp;
  isOfficialResults: boolean;
  usbDrives: UsbDriveInfo[];
  auth: DippedSmartCardAuth.AuthStatus;
  machineConfig: MachineConfig;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  electionPackageHash: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  usbDrives: [],
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
  machineConfig: {
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  },
};

export const AppContext = createContext(appContext);
