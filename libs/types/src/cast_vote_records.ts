import { z } from 'zod';

import {
  CastVoteRecordReport,
  CastVoteRecordReportSchema,
  CVRSchema,
} from './cdf/cast-vote-records';
import {
  BallotStyle,
  BallotType,
  BallotTypeSchema,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  Precinct,
} from './election';
import { ExportDataError } from './errors';
import { Iso8601Timestamp, Iso8601TimestampSchema } from './generic';
import { SheetOf } from './hmpb';
import { PageInterpretation } from './interpretation';

export interface CVRSnapshotOtherStatus {
  ballotType: BallotType;
}
export const CVRSnapshotOtherStatusSchema: z.ZodSchema<CVRSnapshotOtherStatus> =
  z.object({
    ballotType: BallotTypeSchema,
  });

export enum CastVoteRecordExportFileName {
  CAST_VOTE_RECORD_REPORT = 'cast-vote-record-report.json',
  METADATA = 'metadata.json',
  REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX = 'rejected-',
}

export interface CastVoteRecordBatchMetadata {
  readonly id: string;
  readonly label: string;

  /**
   * The ordinal number of the batch in the tabulator's sequence of batches in a given election.
   */
  readonly batchNumber: number;

  /**
   * The start time of the batch. On a precinct scanner, the start time is when the polls are opened or voting is resumed. On a central scanner, the start time is when the user initiates scanning a batch.
   */
  readonly startTime: Iso8601Timestamp;
  /**
   * The end time of the batch. On a precinct scanner, the end time is when the polls are closed or voting is paused. On a central scanner, the end time is when a batch scan is complete
   */
  readonly endTime?: Iso8601Timestamp;

  readonly sheetCount: number;
  readonly scannerId: string;
}

export const CastVoteRecordBatchMetadataSchema: z.ZodSchema<CastVoteRecordBatchMetadata> =
  z.object({
    id: z.string(),
    label: z.string(),
    batchNumber: z.number().positive(),
    startTime: Iso8601TimestampSchema,
    endTime: Iso8601TimestampSchema.optional(),
    sheetCount: z.number(),
    scannerId: z.string(),
  });

/**
 * Metadata stored in the top-level metadata file for a cast vote record export
 */
export interface CastVoteRecordExportMetadata {
  arePollsClosed?: boolean;
  /** A summary of batches in a cast vote record export */
  batchManifest: CastVoteRecordBatchMetadata[];
  /** Global data relevant to all cast vote records in an export, e.g. election info */
  castVoteRecordReportMetadata: CastVoteRecordReport;
  /** A hash of all cast vote record files in an export */
  castVoteRecordRootHash: string;
}

export const CastVoteRecordExportMetadataSchema: z.ZodSchema<CastVoteRecordExportMetadata> =
  z.object({
    arePollsClosed: z.boolean().optional(),
    batchManifest: z.array(CastVoteRecordBatchMetadataSchema),
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
      subType: 'mismatched-ballot-hashes';
      ballotHashes: SheetOf<ElectionDefinition['ballotHash']>;
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

type RecoveryExportError = {
  type: 'recovery-export-error';
} & (
  | { subType: 'expected-export-directory-does-not-exist' }
  | { subType: 'hash-mismatch-after-recovery-export' }
);

/**
 * An error encountered while exporting cast vote records to a USB drive
 */
export type ExportCastVoteRecordsToUsbDriveError =
  | { type: ExportDataError }
  | SheetValidationError
  | RecoveryExportError;

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
  | { type: 'authentication-error'; details: string };

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
