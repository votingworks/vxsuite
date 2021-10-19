import { ElectionDefinition } from '@votingworks/types';
import { MemoryStorage, Storage, usbstick } from '@votingworks/utils';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

interface AppContextInterface {
  usbDriveStatus: usbstick.UsbDriveStatus;
  usbDriveEject: () => void;
  machineConfig: MachineConfig;
  electionDefinition?: ElectionDefinition;
  electionHash?: string;
  storage: Storage;
  lockMachine: () => void;
}

const appContext: AppContextInterface = {
  usbDriveStatus: usbstick.UsbDriveStatus.absent,
  usbDriveEject: () => undefined,
  machineConfig: { machineId: '0000', bypassAuthentication: false },
  electionDefinition: undefined,
  electionHash: undefined,
  storage: new MemoryStorage(),
  lockMachine: () => undefined,
};

const AppContext = createContext(appContext);

export default AppContext;
