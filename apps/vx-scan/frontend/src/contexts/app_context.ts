import { Logger, LogSource } from '@votingworks/logging';
import {
  ElectionDefinition,
  InsertedSmartcardAuth,
  PrecinctSelection,
} from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig } from '../config/types';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  precinctSelection?: PrecinctSelection;
  auth: InsertedSmartcardAuth.Auth;
  logger: Logger;
}

const appContext: AppContextInterface = {
  electionDefinition: undefined,
  precinctSelection: undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
  },
  auth: { status: 'logged_out', reason: 'no_card' },
  logger: new Logger(LogSource.VxScanFrontend),
};

export const AppContext = createContext(appContext);
