import { createContext } from 'react';
import { DippedSmartCardAuth, ElectionDefinition } from '@votingworks/types';
import type { MachineConfig } from '@votingworks/admin-backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { Iso8601Timestamp } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  configuredAt?: Iso8601Timestamp;
  isOfficialResults: boolean;
  usbDriveStatus: UsbDriveStatus;
  auth: DippedSmartCardAuth.AuthStatus;
  machineConfig: MachineConfig;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  configuredAt: undefined,
  isOfficialResults: false,
  usbDriveStatus: mockUsbDriveStatus('no_drive'),
  auth: DippedSmartCardAuth.DEFAULT_AUTH_STATUS,
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
  },
};
/* eslint-enable @typescript-eslint/require-await */

export const AppContext = createContext(appContext);
