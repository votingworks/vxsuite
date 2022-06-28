import {
  ElectionDefinition,
  InsertedSmartcardAuth,
  PrecinctId,
} from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  currentPrecinctId?: PrecinctId;
  auth: InsertedSmartcardAuth.Auth;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  currentPrecinctId: undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  auth: { status: 'logged_out', reason: 'no_card' },
};

export const AppContext = createContext(appContext);
