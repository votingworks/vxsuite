import { z } from 'zod';

import {
  CastVoteRecordReport,
  CastVoteRecordReportSchema,
  CVRSchema,
} from './cdf/cast-vote-records';
import {
  BallotId,
  BallotStyle,
  BallotStyleId,
  BallotType,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  Precinct,
  PrecinctId,
} from './election';
import { ExportDataError } from './errors';
import { Dictionary } from './generic';
import { SheetOf } from './hmpb';
import { PageInterpretation } from './interpretation';

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

export enum CastVoteRecordExportFileName {
  CAST_VOTE_RECORD_REPORT = 'cast-vote-record-report.json',
  METADATA = 'metadata.json',
  REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX = 'rejected-',
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

/**
 * A cast vote record report without metadata
 */
export type CastVoteRecordReportWithoutMetadata = Pick<
  CastVoteRecordReport,
  'CVR'
>;

export const CastVoteRecordReportWithoutMetadataSchema: z.ZodSchema<CastVoteRecordReportWithoutMetadata> =
  z.object({
    CVR: z.array(CVRSchema).optional(),
  });

/**
 * An error encountered while validating a sheet
 */
export type SheetValidationError = {
  type: 'invalid-sheet';
} & (
  | {
      subType: 'incompatible-interpretation-types';
      interpretationTypes: SheetOf<PageInterpretation['type']>;
    }
  | {
      subType: 'mismatched-ballot-style-ids';
      ballotStyleIds: SheetOf<BallotStyle['id']>;
    }
  | {
      subType: 'mismatched-ballot-types';
      ballotTypes: SheetOf<BallotType>;
    }
  | {
      subType: 'mismatched-election-hashes';
      electionHashes: SheetOf<ElectionDefinition['electionHash']>;
    }
  | {
      subType: 'mismatched-precinct-ids';
      precinctIds: SheetOf<Precinct['id']>;
    }
  | {
      subType: 'non-consecutive-page-numbers';
      pageNumbers: SheetOf<HmpbBallotPageMetadata['pageNumber']>;
    }
);

/**
 * An error encountered while exporting cast vote records to a USB drive
 */
export type ExportCastVoteRecordsToUsbDriveError =
  | { type: ExportDataError }
  | SheetValidationError;

/**
 * An error encountered while reading a cast vote record export's metadata file
 */
export type ReadCastVoteRecordExportMetadataError =
  | { type: 'metadata-file-not-found' }
  | { type: 'metadata-file-parse-error' };

/**
 * A top-level error encountered while reading a cast vote record export. Does not include errors
 * encountered while reading individual cast vote records.
 */
export type ReadCastVoteRecordExportError =
  | ReadCastVoteRecordExportMetadataError
  | { type: 'authentication-error' };

export type ReferencedFileType = 'image' | 'layout-file';

/**
 * An error encountered while reading an individual cast vote record
 */
export type ReadCastVoteRecordError = { type: 'invalid-cast-vote-record' } & (
  | { subType: 'batch-id-not-found' }
  | { subType: 'invalid-ballot-image-field' }
  | { subType: 'invalid-ballot-sheet-id' }
  | { subType: 'invalid-write-in-field' }
  | { subType: 'layout-file-parse-error' }
  | { subType: 'no-current-snapshot' }
  | { subType: 'parse-error' }
  | { subType: `${ReferencedFileType}-not-found` }
  | { subType: `${ReferencedFileType}-read-error` }
  | { subType: `incorrect-${ReferencedFileType}-hash` }
);
