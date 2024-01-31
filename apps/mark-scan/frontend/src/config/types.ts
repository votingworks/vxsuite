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
import type { MachineConfig } from '@votingworks/mark-scan-backend';
import {
  ContestsWithMsEitherNeither,
  MsEitherNeitherContest,
} from '@votingworks/mark-flow-ui';

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

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: KioskBrowser.PrintSides;
}

// User Interface
export type ScrollDirections = 'up' | 'down';
export interface ScrollShadows {
  showBottomShadow: boolean;
  showTopShadow: boolean;
}
export interface Scrollable {
  isScrollable: boolean;
}
