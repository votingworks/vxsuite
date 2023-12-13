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
