import {
  BallotStyleId,
  BallotType,
  Contest,
  ContestId,
  PrecinctId,
  SummaryBallotPageMetadata,
  VotesDict,
} from '@votingworks/types';

/**
 * Maximum number of characters in a write-in.
 */
export const MAXIMUM_WRITE_IN_LENGTH = 40;

/**
 * Exact length of the ballot hash used in the ballot encoding.
 */
export const BALLOT_HASH_ENCODING_LENGTH = 20;

/**
 * Maximum number of pages in a bubble ballot.
 */
export const MAXIMUM_PAGE_NUMBERS = 30;

/**
 * Maximum precinct index that we can encode in 13 bits.
 */
export const MAXIMUM_PRECINCT_INDEX = 8191; // 2^13 - 1

/**
 * Maximum ballot style index that we can encode in 16 bits.
 */
export const MAXIMUM_BALLOT_STYLE_INDEX = 65535; // 2^16 - 1

/**
 * Maximum number of pages in a summary ballot (same as bubble ballot).
 */
export const MAXIMUM_SUMMARY_BALLOT_PAGES = MAXIMUM_PAGE_NUMBERS;

/**
 * Slices a ballot hash down to the length used in ballot encoding. Useful
 * to have this as a utility function so it can be mocked in other modules' tests.
 */
export function sliceBallotHashForEncoding(ballotHash: string): string {
  return ballotHash.slice(0, BALLOT_HASH_ENCODING_LENGTH);
}

/**
 * Data needed to uniquely identify a ballot page, possibly including an ID.
 */
export interface BallotConfig {
  ballotStyleId: BallotStyleId;
  ballotType: BallotType;
  isTestMode: boolean;
  precinctId: PrecinctId;
  pageNumber: number;
  /**
   * Appears on bubble ballots only when using the
   * SystemSettings.precinctScanEnableBallotAuditIds feature.
   */
  ballotAuditId?: string;
}

/**
 * Data for a single page of a summary ballot.
 */
export interface SummaryBallotPage {
  ballotHash: string;
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  isTestMode: boolean;
  ballotType: BallotType;
  pageNumber: number;
  totalPages: number;
  ballotAuditId: string;
  /**
   * The contests included on this page
   * TODO: Change this to a list of contest IDs rather than contest objects
   * since that's all we need. We can and should look up the whole contest
   * objects via the election def for the given ballot style ID.
   */
  contests: readonly Contest[];
  /** Votes for the contests on this page */
  votes: VotesDict;
}

/**
 * Result of decoding a summary ballot page.
 */
export interface DecodedSummaryBallotPage {
  metadata: SummaryBallotPageMetadata;
  votes: VotesDict;
}

/**
 * The contest IDs on a decoded summary ballot page, in ballot style order.
 */
export type ContestIdsOnPage = readonly ContestId[];
