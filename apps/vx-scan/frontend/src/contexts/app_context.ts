import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  precinctSelection?: PrecinctSelection;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  precinctSelection: undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
};

export const AppContext = createContext(appContext);
