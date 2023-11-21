import { PollsState, PrecinctSelection } from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export interface ElectionState {
  precinctSelection?: PrecinctSelection;
  ballotsPrintedCount: number;
  isTestMode: boolean;
  pollsState: PollsState;
}

export type ScreenOrientation = 'portrait' | 'landscape';
