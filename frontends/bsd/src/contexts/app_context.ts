import { LoggingUserRole, LogSource, Logger } from '@votingworks/logging';
import { DippedSmartcardAuth, ElectionDefinition } from '@votingworks/types';
import { MemoryStorage, Storage, usbstick } from '@votingworks/utils';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  usbDriveStatus: usbstick.UsbDriveStatus;
  usbDriveEject: (currentUser: LoggingUserRole) => void;
  machineConfig: MachineConfig;
  electionDefinition?: ElectionDefinition;
  electionHash?: string;
  storage: Storage;
  auth: DippedSmartcardAuth.Auth;
  logger: Logger;
}

const appContext: AppContextInterface = {
  usbDriveStatus: usbstick.UsbDriveStatus.absent,
  usbDriveEject: () => undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  electionDefinition: undefined,
  electionHash: undefined,
  storage: new MemoryStorage(),
  logger: new Logger(LogSource.VxCentralScanFrontend),
  auth: {
    status: 'logged_out',
    reason: 'machine_locked',
    bootstrapAuthenticatedAdminSession: () => undefined,
  },
};

export const AppContext = createContext(appContext);
