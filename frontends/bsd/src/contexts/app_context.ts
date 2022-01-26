import { LoggingUserRole, LogSource, Logger } from '@votingworks/logging';
import { ElectionDefinition, UserSession } from '@votingworks/types';
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
  lockMachine: () => void;
  currentUserSession?: UserSession;
  logger: Logger;
}

const appContext: AppContextInterface = {
  usbDriveStatus: usbstick.UsbDriveStatus.absent,
  usbDriveEject: () => undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
    bypassAuthentication: false,
  },
  electionDefinition: undefined,
  electionHash: undefined,
  storage: new MemoryStorage(),
  lockMachine: () => undefined,
  currentUserSession: undefined,
  logger: new Logger(LogSource.VxCentralScanFrontend),
};

export const AppContext = createContext(appContext);
