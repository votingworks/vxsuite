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
  hasOvervote: 'Has Overvote',
  hasUndervote: 'Has Undervote',
  hasWriteIn: 'Has Write-In',
};

/**
 * Filter options in the reporting interfaces, which extends beyond core
 * filters on CVR properties to include adjudication status.
 */
export type ReportingFilter = Tabulation.Filter & {
  adjudicationFlags?: CastVoteRecordAdjudicationFlag[];
};
