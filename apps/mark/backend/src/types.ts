import {
  BallotStyleId,
  PollsState,
  PrecinctSelection,
  VotesDict,
} from '@votingworks/types';

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

export interface PrintBallotProps {
  ballotStyleId: BallotStyleId;
  languageCode: string;
  precinctId: string;
  votes: VotesDict;
}
