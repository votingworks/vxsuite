import { Logger, LogSource } from '@votingworks/logging';
import {
  ElectionDefinition,
  InsertedSmartcardAuth,
  MarkThresholds,
  PrecinctSelection,
} from '@votingworks/types';
import { createContext } from 'react';
import { MachineConfig, SetUserSettings, UserSettings } from '../config/types';
import * as GLOBALS from '../config/globals';

export interface AppContextInterface {
  electionDefinition?: ElectionDefinition;
  machineConfig: Readonly<MachineConfig>;
  precinctSelection?: PrecinctSelection;
  currentMarkThresholds?: MarkThresholds;
  auth: InsertedSmartcardAuth.Auth;
  isSoundMuted: boolean;
  logger: Logger;
  setUserSettings: SetUserSettings;
  userSettings: UserSettings;
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
  logger: new Logger(LogSource.VxPrecinctScanFrontend),
  userSettings: {
    sizeTheme: GLOBALS.DEFAULT_FONT_SIZE,
    contrastTheme: GLOBALS.DEFAULT_CONTRAST_THEME,
  },
  setUserSettings: () => undefined,
};

export const AppContext = createContext(appContext);
