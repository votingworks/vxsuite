import {
  ElectionDefinition,
  InsertedSmartcardAuth,
  MarkThresholds,
  PrecinctSelection,
} from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  precinctSelection?: PrecinctSelection;
  currentMarkThresholds?: MarkThresholds;
  auth: InsertedSmartcardAuth.Auth;
  isSoundMuted: boolean;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  precinctSelection: undefined,
  currentMarkThresholds: undefined,
  isSoundMuted: false,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  auth: { status: 'logged_out', reason: 'no_card' },
};

export const AppContext = createContext(appContext);
