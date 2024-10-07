import {
  AnyContest,
  BallotStyleGroupId,
  BallotType,
  Candidate,
  CandidateId,
  ContestId,
  ContestOptionId,
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
  yesOptionId: ContestOptionId;
  noOptionId: ContestOptionId;
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

export type VotingMethod = `${BallotType}`;
export const SUPPORTED_VOTING_METHODS: VotingMethod[] = [
  'precinct',
  'absentee',
];

export const VOTING_METHOD_LABELS: Record<VotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
  provisional: 'Provisional',
};

/**
 * Indicates what cast vote records to include when calculating results.
 * Omission of a filter attribute indicates *not* filtering on it at all.
 * So an empty `Filter` of `{}` would indicate including all cast
 * vote records in the results.
 */
export interface Filter {
  readonly ballotStyleGroupIds?: BallotStyleGroupId[];
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
  readonly ballotStyleGroupId: Id;
  readonly precinctId: PrecinctId;
  readonly votingMethod: VotingMethod;
  readonly batchId: Id;
  readonly scannerId: Id;
  readonly partyId?: Id;
}

/**
 * A scanned card can either be a BMD ballot or a sheet of an HMPB ballot,
 * indicated by its 1-indexed `sheetNumber`.
 */
export type Card = { type: 'bmd' } | { type: 'hmpb'; sheetNumber: number };

export const MANUAL_BATCH_ID = 'NO_BATCH__MANUAL';
export const MANUAL_SCANNER_ID = 'NO_SCANNER__MANUAL';

/**
 * In situations where we're generating grouped results, specifiers can be
 * included in {@link ElectionResults} to indicate what it is a grouping of.
 */
export type GroupSpecifier = Partial<{
  -readonly [K in keyof CastVoteRecordAttributes]: CastVoteRecordAttributes[K];
}>;

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
  hmpb: Array<number | undefined>;
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

/**
 * The write-in summary for a specific contest including the number of total
 * write-ins, pending write-ins, invalid write-ins, and write-ins adjudicated
 * for each candidate.
 */
export interface ContestWriteInSummary {
  contestId: ContestId;
  totalTally: number;
  pendingTally: number;
  invalidTally: number;
  candidateTallies: Record<Id, CandidateTally>;
}

/**
 * All write-in summaries for an election, keyed by contest ID.
 */
export interface ElectionWriteInSummary {
  contestWriteInSummaries: Record<ContestId, ContestWriteInSummary>;
}

/** ID for an unadjudicated write-in */
export const GENERIC_WRITE_IN_ID = 'write-in';
/** Placeholder name for an unadjudicated write-in */
export const GENERIC_WRITE_IN_NAME = 'Write-In';
/**
 * Represents an unadjudicated write-in, which ultimately may not be a vote
 * for a candidate.
 */
export const GENERIC_WRITE_IN_CANDIDATE: Candidate = {
  id: GENERIC_WRITE_IN_ID,
  name: GENERIC_WRITE_IN_NAME,
  isWriteIn: true,
};

export const PENDING_WRITE_IN_ID = GENERIC_WRITE_IN_ID;
export const PENDING_WRITE_IN_NAME = 'Unadjudicated Write-In';
/**
 * Represents a pending write-in, which ultimately may not be a vote for a
 * candidate. Distinguished
 */
export const PENDING_WRITE_IN_CANDIDATE: Candidate = {
  id: PENDING_WRITE_IN_ID,
  name: PENDING_WRITE_IN_NAME,
  isWriteIn: true,
};

/**
 * Minimal information about a scanner batch.
 */
export interface ScannerBatch {
  batchId: string;
  scannerId: string;
}

export const BATCH_ID_DISPLAY_LENGTH = 8;
export const TALLY_REPORT_PRIVACY_THRESHOLD = 10;
