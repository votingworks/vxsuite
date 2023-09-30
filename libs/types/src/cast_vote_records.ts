import { z } from 'zod';

import {
  CastVoteRecordReport,
  CastVoteRecordReportSchema,
} from './cdf/cast-vote-records';
import { BallotId, BallotStyleId, PrecinctId } from './election';
import { Dictionary } from './generic';

/**
 * Legacy type, slightly different than the CDF ballot type.
 */
export type CastVoteRecordBallotType = 'absentee' | 'provisional' | 'precinct';

/**
 * Legacy cast vote record type, currently used by tally code.
 */
export interface CastVoteRecord
  extends Dictionary<string | readonly string[] | boolean> {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: CastVoteRecordBallotType;
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
}

/**
 * Metadata stored in the top-level metadata file for a cast vote record export
 */
export interface CastVoteRecordExportMetadata {
  arePollsClosed?: boolean;
  /** Global data relevant to all cast vote records in an export, e.g. election info */
  castVoteRecordReportMetadata: CastVoteRecordReport;
  /** A hash of all cast vote record files in an export */
  castVoteRecordRootHash: string;
}

export const CastVoteRecordExportMetadataSchema: z.ZodSchema<CastVoteRecordExportMetadata> =
  z.object({
    arePollsClosed: z.boolean().optional(),
    castVoteRecordReportMetadata: CastVoteRecordReportSchema,
    castVoteRecordRootHash: z.string(),
  });

export enum CastVoteRecordExportFileName {
  CAST_VOTE_RECORD_REPORT = 'cast-vote-record-report.json',
  METADATA = 'metadata.json',
  REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX = 'rejected-',
}
