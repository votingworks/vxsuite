import { ContestId } from '../election';
import * as Tabulation from '../tabulation';

export const ADJUDICATION_FLAGS = [
  'isBlank',
  'hasOvervote',
  'hasUndervote',
  'hasWriteIn',
] as const;

export type CastVoteRecordAdjudicationFlag =
  (typeof ADJUDICATION_FLAGS)[number];

export const ADJUDICATION_FLAG_LABELS: Record<
  CastVoteRecordAdjudicationFlag,
  string
> = {
  isBlank: 'Blank Ballot',
  hasOvervote: 'Overvote',
  hasUndervote: 'Undervote',
  hasWriteIn: 'Write-In',
};

/**
 * Features of cast vote records that VxAdmin can filter on, which extends beyond
 * features that the tabulation code can group on, e.g. adjudication flags.
 */
export type ReportingFilter = Tabulation.Filter & {
  adjudicationFlags?: CastVoteRecordAdjudicationFlag[];
};

/**
 * Features of cast vote records that the VxAdmin allows filtering on, which
 * includes features that converted to other, lower-level filters on the
 * backend, e.g. district.
 */
export type FrontendReportingFilter = ReportingFilter & {
  districtIds?: string[];
};

/**
 * For primary reports, we need card counts split by party.
 */
export type CardCountsByParty = Record<string, Tabulation.CardCounts>;

interface TallyReportResultsBase {
  contestIds: ContestId[];
  scannedResults: Tabulation.ElectionResults;
  manualResults?: Tabulation.ManualElectionResults;
}

/**
 * Results for a tally report not split by party, usually for a general or
 * as a data intermediate in tabulation code.
 */
export type SingleTallyReportResults = TallyReportResultsBase & {
  hasPartySplits: false;
  cardCounts: Tabulation.CardCounts;
};

/**
 * Results for a tally report split by party, used for primary elections.
 */
export type PartySplitTallyReportResults = TallyReportResultsBase & {
  hasPartySplits: true;
  cardCountsByParty: CardCountsByParty;
};

/**
 * Data necessary to display a frontend tally report.
 */
export type TallyReportResults =
  | SingleTallyReportResults
  | PartySplitTallyReportResults;
