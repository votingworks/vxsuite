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
  pollingPlaceId?: string;
  ballotsPrintedCount: number;
  isTestMode: boolean;
  pollsState: PollsState;
}

export type ScreenOrientation = 'portrait' | 'landscape';

export interface PrintBallotProps {
  languageCode: string;
  precinctId: string;
  ballotStyleId: BallotStyleId;
  votes: VotesDict;
}

export type BmdModelNumber = 'bmd-150' | 'bmd-155';
