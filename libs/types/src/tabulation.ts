import {
  AnyContest,
  BallotStyleId,
  Candidate,
  CandidateId,
  ContestId,
  ContestOptionId,
  PrecinctId,
} from './election';
import * as CVR from './cdf/cast-vote-records/index';
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

export type VotingMethod = `${CVR.vxBallotType}`;

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
 * A scanned card can either be a BMD ballot or a sheet of an HMPB ballot,
 * indicated by its 1-indexed `sheetNumber`.
 */
export type Card = { type: 'bmd' } | { type: 'hmpb'; sheetNumber: number };

/**
 * In situations where we're generating grouped results, specifiers can be
 * included in {@link ElectionResults} to indicate what it is a grouping of.
 */
export type GroupSpecifier = Partial<{
  -readonly [K in keyof CastVoteRecordAttributes]: CastVoteRecordAttributes[K];
}> & {
  partyId?: Id;
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

/**
 * Object containing the counts for each scanned sheet.
 * - `bmd` is the number of single-sheet BMD ballots scanned
 * - `hmpb` is an array of the counts of each numbered ballot sheet. The number
 * at index `0` is the count of card 1, at index `1` is the count of card 2,
 * and so on
 * - `manual` contains the count of manual entered ballot results
 */
export interface CardCounts {
  bmd: number;
  hmpb: number[];
  manual?: number;
}

/**
 * Represents the results of all contests in an election, often filtered by
 * some cast vote record attributes.
 */
export interface ElectionResults {
  readonly contestResults: Record<ContestId, ContestResults>;
  readonly cardCounts: CardCounts;
}

export type GroupKey = string;
/**
 * Simply a map of keys to some values relevant to tabulation. The keys contain encoded
 * metadata about the group, defined in `libs/utils`. The consumer can convert the
 * {@link GroupMap} to a {@link GroupList}.
 */
export type GroupMap<T> = Record<GroupKey, T>;

export type GroupOf<T> = T & GroupSpecifier;
/**
 * A {@link GroupList} is a list of objects relevant to tabulation with metadata
 * as part of each object identifying the group.
 */
export type GroupList<T> = Array<GroupOf<T>>;

export type ElectionResultsGroupMap = GroupMap<ElectionResults>;
export type ElectionResultsGroupList = GroupList<ElectionResults>;

/**
 * Simplified representation of votes on a scanned ballot for tabulation
 * purposes.
 */
export type Votes = Record<ContestId, ContestOptionId[]>;

export type CastVoteRecord = {
  readonly votes: Votes;
  readonly card: Card;
} & CastVoteRecordAttributes;

/**
 * Manually entered results are represented the same as for scanned results,
 * except we have a single overall ballot count rather than individual card
 * counts.
 */
export type ManualElectionResults = Omit<ElectionResults, 'cardCounts'> & {
  ballotCount: number;
};
export type ManualResultsGroupMap = GroupMap<ManualElectionResults>;
export type ManualResultsGroupList = GroupList<ManualElectionResults>;

export type ManualBallotCountsGroupMap = GroupMap<number>;
