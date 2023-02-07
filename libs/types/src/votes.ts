import { BallotId, BallotType } from './election';
import { Dictionary } from './generic';

export interface CandidateSelection {
  isWriteIn: false;
  candidateId: string;
}

export interface WriteInSelection {
  isWriteIn: true;
  name: string;
}

export type CandidateContestSelection = CandidateSelection | WriteInSelection;
export type CandidateContestVote = CandidateContestSelection[];

export interface BallotMeasureSelection {
  optionId: string;
}

export type BallotMeasureContestVote = BallotMeasureSelection[];

export type ContestVote = CandidateContestVote | BallotMeasureContestVote;
export type ContestVotes = Dictionary<ContestVote>;

export interface CompletedBallot {
  readonly electionHash: string;
  readonly ballotStyleId: string;
  readonly precinctId: string;
  readonly ballotId?: BallotId;
  readonly votes: ContestVotes;
  readonly isTestMode: boolean;
  readonly ballotType: BallotType;
}
