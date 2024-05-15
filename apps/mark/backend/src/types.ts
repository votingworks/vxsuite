import { PollsState, PrecinctSelection } from '@votingworks/types';
import { PrintBallotProps as BackendPrintBallotProps } from './util/print_ballot';

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

export type PrintBallotProps = Omit<
  BackendPrintBallotProps,
  'store' | 'printer'
>;
