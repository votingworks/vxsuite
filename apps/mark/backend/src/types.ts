import { AppMode } from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  appMode: AppMode;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export type ScreenOrientation = 'portrait' | 'landscape';
