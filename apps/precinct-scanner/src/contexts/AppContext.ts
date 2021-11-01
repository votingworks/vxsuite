import { ElectionDefinition, PrecinctId } from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  currentPrecinctId?: PrecinctId;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  currentPrecinctId: undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
    bypassAuthentication: false,
  },
};

export const AppContext = createContext(appContext);
