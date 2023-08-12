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
import { Id, NewType } from './generic';

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
 * These attributes are the minimum set of attributes for a cast vote record, meaning
 * other attributes such as partyId and scannerId can be derived from these. E.g. the
 * ballot style indicates a party and the batch indicates a scanner.
 */
export interface FundamentalCastVoteRecordAttributes {
  ballotStyleId: BallotStyleId;
  batchId: Id;
  precinctId: PrecinctId;
  votingMethod: VotingMethod;
}

interface Fundamental {
  isFundamental: true;
}
export interface FundamentalFilter extends Fundamental {
  ballotStyleIds?: BallotStyleId[];
  batchIds?: Id[];
  precinctIds?: PrecinctId[];
  votingMethods?: VotingMethod[];
}
export interface FundamentalGroupBy extends Fundamental {
  groupByBallotStyle?: boolean;
  groupByBatch?: boolean;
  groupByPrecinct?: boolean;
  groupByVotingMethod?: boolean;
}
export type FundamentalGroupSpecifier = Fundamental &
  Partial<FundamentalCastVoteRecordAttributes>;

export type Expanded<T> = Omit<T, 'isFundamental'>;
export type Filter = Expanded<FundamentalFilter> & {
  districtIds?: Id[];
  partyIds?: Id[];
  scannerIds?: Id[];
};
export type GroupBy = Expanded<FundamentalGroupBy> & {
  groupByParty?: boolean;
  groupByScanner?: boolean;
};
export type GroupSpecifier = Expanded<FundamentalGroupSpecifier> & {
  partyId?: Id;
  scannerId?: Id;
};

export type FundamentalGroupKey = NewType<string, 'FundamentalGroupKey'>;
export type FundamentalGroupMap<T> = Record<FundamentalGroupKey, T>;
export type FundamentalGroupOf<T> = T & FundamentalGroupSpecifier;
export type FundamentalGroupList<T> = Array<FundamentalGroupOf<T>>;

export type GroupOf<T> = T & GroupSpecifier;
export type GroupList<T> = Array<GroupOf<T>>;

export interface ScannerBatch {
  batchId: Id;
  scannerId: Id;
}

/**
 * A scanned card can either be a BMD ballot or a sheet of an HMPB ballot,
 * indicated by its 1-indexed `sheetNumber`.
 */
export type Card = { type: 'bmd' } | { type: 'hmpb'; sheetNumber: number };

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
export type CardCountsGroupMap = FundamentalGroupMap<CardCounts>;

/**
 * Represents the results of all contests in an election, often filtered by
 * some cast vote record attributes.
 */
export interface ElectionResults {
  readonly contestResults: Record<ContestId, ContestResults>;
  readonly cardCounts: CardCounts;
}
export type ElectionResultsGroupMap = FundamentalGroupMap<ElectionResults>;

/**
 * Simplified representation of votes on a scanned ballot for tabulation
 * purposes.
 */
export type Votes = Record<ContestId, ContestOptionId[]>;

export type CastVoteRecord = {
  readonly votes: Votes;
  readonly card: Card;
} & FundamentalCastVoteRecordAttributes;

/**
 * Manually entered results are represented the same as for scanned results,
 * except we have a single overall ballot count rather than individual card
 * counts.
 */
export type ManualElectionResults = Omit<ElectionResults, 'cardCounts'> & {
  ballotCount: number;
};
export type ManualResultsGroupMap = FundamentalGroupMap<ManualElectionResults>;
export type ManualBallotCountsGroupMap = FundamentalGroupMap<{
  ballotCount: number;
}>;

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
export type ElectionWriteInSummaryGroupMap =
  FundamentalGroupMap<ElectionWriteInSummary>;
