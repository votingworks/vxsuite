import { createContext } from 'react';
import {
  DEV_MACHINE_ID,
  DippedSmartCardAuth,
  ElectionDefinition,
} from '@votingworks/types';
import type {
  MachineConfig,
  VxAdminMachineMode,
} from '@votingworks/admin-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { Iso8601Timestamp } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  configuredAt?: Iso8601Timestamp;
  isOfficialResults: boolean;
  usbDriveStatus: UsbDriveStatus;
  auth: DippedSmartCardAuth.AuthStatus;
  machineConfig: MachineConfig;
  machineMode: VxAdminMachineMode;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  electionPackageHash: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  usbDriveStatus: mockUsbDriveStatus('no_drive'),
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
  machineConfig: {
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  },
  machineMode: 'traditional',
};

export const AppContext = createContext(appContext);
