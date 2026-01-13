import { z } from 'zod/v4';

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

export const CVRSnapshotOtherStatusSchema = z.object({
  ballotType: BallotTypeSchema,
});

export interface CVRSnapshotOtherStatus
  extends z.infer<typeof CVRSnapshotOtherStatusSchema> {}

export enum CastVoteRecordExportFileName {
  CAST_VOTE_RECORD_REPORT = 'cast-vote-record-report.json',
  METADATA = 'metadata.json',
  REJECTED_SHEET_SUB_DIRECTORY_NAME_PREFIX = 'rejected-',
}

/**
 * Metadata for a batch of cast vote records.
 */
export const CastVoteRecordBatchMetadataSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    /**
     * The ordinal number of the batch in the tabulator's sequence of batches in a given election.
     */
    batchNumber: z.number().positive(),
    /**
     * The start time of the batch. On a precinct scanner, the start time is when the polls are opened or voting is resumed. On a central scanner, the start time is when the user initiates scanning a batch.
     */
    startTime: Iso8601TimestampSchema,
    /**
     * The end time of the batch. On a precinct scanner, the end time is when the polls are closed or voting is paused. On a central scanner, the end time is when a batch scan is complete
     */
    endTime: Iso8601TimestampSchema.optional(),
    sheetCount: z.number(),
    scannerId: z.string(),
  })
  .readonly();

export interface CastVoteRecordBatchMetadata
  extends z.infer<typeof CastVoteRecordBatchMetadataSchema> {}

/**
 * Metadata stored in the top-level metadata file for a cast vote record export
 */
/** A summary of batches in a cast vote record export */
/** Global data relevant to all cast vote records in an export, e.g. election info */
/** A hash of all cast vote record files in an export */
export const CastVoteRecordExportMetadataSchema = z.object({
  arePollsClosed: z.boolean().optional(),
  batchManifest: z.array(CastVoteRecordBatchMetadataSchema),
  castVoteRecordReportMetadata: CastVoteRecordReportSchema,
  castVoteRecordRootHash: z.string(),
});

export interface CastVoteRecordExportMetadata
  extends z.infer<typeof CastVoteRecordExportMetadataSchema> {}

/**
 * A cast vote record report without metadata
 */
export const CastVoteRecordReportWithoutMetadataSchema = z.object({
  CVR: z.array(CVRSchema).optional(),
});

export interface CastVoteRecordReportWithoutMetadata
  extends z.infer<typeof CastVoteRecordReportWithoutMetadataSchema> {}

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
  | { subType: 'no-original-snapshot' }
  | { subType: 'parse-error' }
  | { subType: `${ReferencedFileType}-not-found` }
  | { subType: `${ReferencedFileType}-read-error` }
  | { subType: `incorrect-${ReferencedFileType}-hash` }
);
