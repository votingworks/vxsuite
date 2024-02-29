import {
  BallotStyleId,
  CandidateContest,
  CandidateVote,
  ContestId,
  Election,
  ElectionDefinition,
  OptionalVote,
  OptionalYesNoVote,
  PrecinctId,
  VotesDict,
  YesNoContest,
} from '@votingworks/types';
import {
  ContestsWithMsEitherNeither,
  MsEitherNeitherContest,
} from '../utils/ms_either_neither_contests';

// Ballot
export type UpdateVoteFunction = (
  contestId: ContestId,
  vote: OptionalVote
) => void;

export interface BallotContextInterface {
  machineConfig: MachineConfig;
  ballotStyleId?: BallotStyleId;
  contests: ContestsWithMsEitherNeither;
  readonly electionDefinition?: ElectionDefinition;
  generateBallotId: () => string;
  isCardlessVoter: boolean;
  isLiveMode: boolean;
  endVoterSession: () => Promise<void>;
  precinctId?: PrecinctId;
  resetBallot: (showPostVotingInstructions?: boolean) => void;
  updateTally: () => void;
  updateVote: UpdateVoteFunction;
  votes: VotesDict;
}

// Review and Printed Ballot
export interface CandidateContestResultInterface {
  contest: CandidateContest;
  election: Election;
  precinctId: PrecinctId;
  vote: CandidateVote;
}
export interface YesNoContestResultInterface {
  contest: YesNoContest;
  election: Election;
  vote: OptionalYesNoVote;
}
export interface MsEitherNeitherContestResultInterface {
  contest: MsEitherNeitherContest;
  election: Election;
  eitherNeitherContestVote: OptionalYesNoVote;
  pickOneContestVote: OptionalYesNoVote;
}

// Machine Config
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export type ScreenOrientation = 'portrait' | 'landscape';
