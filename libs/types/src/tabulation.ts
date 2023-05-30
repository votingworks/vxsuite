import {
  AnyContest,
  BallotStyleId,
  Candidate,
  CandidateId,
  ContestId,
  PrecinctId,
} from './election';
import { Id } from './generic';

export interface ContestResultsMetadata {
  overvotes: number;
  undervotes: number;
  ballots: number;
}

type ContestResultsBase = ContestResultsMetadata & {
  readonly contestId: ContestId;
  readonly contestType: AnyContest['type'];
};

export type YesNoContestResults = ContestResultsBase & {
  readonly contestType: 'yesno';
  yesTally: number;
  noTally: number;
};

export type CandidateTally = Candidate & {
  tally: number;
};

export type CandidateContestResults = ContestResultsBase & {
  readonly contestType: 'candidate';
  readonly votesAllowed: number;
  readonly tallies: Record<CandidateId, CandidateTally>;
};

/**
 * Represents the results of a single contest in an election, often filtered by
 * some cast vote record attributes.
 */
export type ContestResults = YesNoContestResults | CandidateContestResults;

/**
 * Should match `CVR.vxBallotStyle`.
 */
export type VotingMethod = 'absentee' | 'precinct' | 'provisional';

/**
 * Indicates what cast vote records to include when calculating results.
 * Omission of a filter attribute indicates *not* filtering on it at all.
 * So an empty `Filter` of `{}` would indicate including all cast
 * vote records in the results.
 */
export interface Filter {
  readonly ballotStyleIds?: BallotStyleId[];
  readonly partyIds?: Id[];
  readonly precinctIds?: PrecinctId[];
  readonly votingMethods?: VotingMethod[];
  readonly batchIds?: Id[];
  readonly scannerIds?: Id[];
}

/**
 * Attributes that always exist for every cast vote record.
 */
export interface CastVoteRecordAttributes {
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly votingMethod: VotingMethod;
  readonly batchId: Id;
  readonly scannerId: Id;
}

/**
 * Scanned cards can either by BMD ballots or a sheet of an HMPB ballot,
 * indicated by its 1-indexed number.
 */
export type CardType = 'bmd' | number;

/**
 * In situations where we're generating grouped results, specifiers can be
 * included in {@link ElectionResult} to indicate what it is a grouping of.
 */
export type GroupSpecifier = Partial<CastVoteRecordAttributes> & {
  readonly partyId?: Id;
};

/**
 * The cast vote record attributes we can use to group election results. For
 * example, you may have the full election results grouped by ballot style.
 * The grouping options are all based on {@link CastVoteRecordAttributes}
 * except for `party`, which is determined based on `ballotStyle`.
 */
export interface GroupBy {
  groupByBallotStyle?: boolean;
  groupByParty?: boolean;
  groupByPrecinct?: boolean;
  groupByVotingMethod?: boolean;
  groupByBatch?: boolean;
  groupByScanner?: boolean;
}

export type CardCounts = Record<CardType, number>;

/**
 * Represents the results of all contests in an election, often filtered by
 * some cast vote record attributes.
 */
export interface ElectionResults {
  readonly contestResults: Record<ContestId, ContestResults>;
  readonly cardCounts: CardCounts;
}

export type GroupKey = string;
export type GroupOf<T> = T & GroupSpecifier;
export type Grouped<T> = Record<GroupKey, GroupOf<T>>;

export type GroupedElectionResults = Grouped<ElectionResults>;

/**
 * Simplified representation of votes on a scanned ballot for tabulation
 * purposes.
 */
export type Votes = Record<ContestId, Id[]>;

export type CastVoteRecord = {
  readonly votes: Votes;
  readonly cardType: CardType;
} & CastVoteRecordAttributes;
