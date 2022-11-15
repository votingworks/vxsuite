import {
  BallotLocale,
  BallotLocaleSchema,
  BallotStyleId,
  BallotStyleIdSchema,
  CastVoteRecord,
  ContestId,
  ContestIdSchema,
  ContestOptionId,
  ContestOptionIdSchema,
  ElectionDefinition,
  ElectionDefinitionSchema,
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  PrecinctId,
  PrecinctIdSchema,
  Rect,
  RectSchema,
} from '@votingworks/types';
import * as z from 'zod';

/**
 * An election definition and associated DB metadata.
 */
export interface ElectionRecord {
  readonly id: Id;
  readonly electionDefinition: ElectionDefinition;
  readonly createdAt: Iso8601Timestamp;
  readonly isOfficialResults: boolean;
}

/**
 * Schema for {@link ElectionRecord}.
 */
export const ElectionRecordSchema: z.ZodSchema<ElectionRecord> = z.object({
  id: IdSchema,
  electionDefinition: ElectionDefinitionSchema,
  createdAt: Iso8601TimestampSchema,
  isOfficialResults: z.boolean(),
});

/**
 * Info related to a CVR file import attempt.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type CvrFileImportInfo = {
  id: Id;
  alreadyPresent: number;
  exportedTimestamp: Iso8601Timestamp;
  fileMode: CvrFileMode;
  fileName: string;
  newlyAdded: number;
  scannerIds: string[];
  wasExistingFile: boolean;
};

/**
 * A cast vote record file's metadata.
 */
export interface CastVoteRecordFileRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly filename: string;
  readonly sha256Hash: string;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link CastVoteRecordFileRecord}.
 */
export const CastVoteRecordFileRecordSchema: z.ZodSchema<CastVoteRecordFileRecord> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    filename: z.string().nonempty(),
    sha256Hash: z.string().nonempty(),
    createdAt: Iso8601TimestampSchema,
  });

/**
 * A Cast Vote Record's metadata.
 */
export interface CastVoteRecordFileEntryRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly data: string;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link CastVoteRecordFileEntryRecord}.
 */
export const CastVoteRecordFileEntryRecordSchema: z.ZodSchema<CastVoteRecordFileEntryRecord> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    data: z.string(),
    createdAt: Iso8601TimestampSchema,
  });

/**
 * Status values for a write-in adjudication.
 */
export type WriteInAdjudicationStatus =
  | 'pending'
  | 'transcribed'
  | 'adjudicated';

/**
 * Schema for {@link WriteInAdjudicationStatus}.
 */
export const WriteInAdjudicationStatusSchema: z.ZodSchema<WriteInAdjudicationStatus> =
  z.union([
    z.literal('pending'),
    z.literal('transcribed'),
    z.literal('adjudicated'),
  ]);

/**
 * A write-in that has no transcription yet.
 */
export interface WriteInRecordPendingTranscription {
  readonly id: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly castVoteRecordId: Id;
  readonly status: 'pending';
}

/**
 * Schema for {@link WriteInRecordPendingTranscription}.
 */
export const WriteInRecordPendingTranscriptionSchema: z.ZodSchema<WriteInRecordPendingTranscription> =
  z.object({
    id: IdSchema,
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
    castVoteRecordId: IdSchema,
    status: z.literal('pending'),
  });

/**
 * A write-in that has a transcription but no adjudication yet.
 */
export interface WriteInRecordTranscribed {
  readonly id: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly castVoteRecordId: Id;
  readonly status: 'transcribed';
  readonly transcribedValue: string;
}

/**
 * Schema for {@link WriteInRecordTranscribed}.
 */
export const WriteInRecordTranscribedSchema: z.ZodSchema<WriteInRecordTranscribed> =
  z.object({
    id: IdSchema,
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
    castVoteRecordId: IdSchema,
    status: z.literal('transcribed'),
    transcribedValue: z.string().nonempty(),
  });

/**
 * A write-in that has been adjudicated.
 */
export interface WriteInRecordAdjudicated {
  readonly id: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly castVoteRecordId: Id;
  readonly status: WriteInAdjudicationStatus;
  readonly transcribedValue: string;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * Schema for {@link WriteInRecordAdjudicated}.
 */
export const WriteInRecordAdjudicatedSchema: z.ZodSchema<WriteInRecordAdjudicated> =
  z.object({
    id: IdSchema,
    contestId: ContestIdSchema,
    optionId: ContestOptionIdSchema,
    castVoteRecordId: IdSchema,
    status: z.literal('transcribed'),
    transcribedValue: z.string().nonempty(),
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
  });

/**
 * Information about a write-in in one of the adjudication states.
 */
export type WriteInRecord =
  | WriteInRecordPendingTranscription
  | WriteInRecordTranscribed
  | WriteInRecordAdjudicated;

/**
 * Schema for {@link WriteInRecord}.
 */
export const WriteInsRecordSchema: z.ZodSchema<WriteInRecord> = z.union([
  WriteInRecordPendingTranscriptionSchema,
  WriteInRecordTranscribedSchema,
  WriteInRecordAdjudicatedSchema,
]);

/**
 * Write-in adjudication information.
 */
export interface WriteInAdjudicationRecord {
  readonly id: Id;
  readonly contestId: ContestId;
  readonly transcribedValue: string;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * Schema for {@link WriteInAdjudicationRecord}.
 */
export const WriteInAdjudicationRecordSchema: z.ZodSchema<WriteInAdjudicationRecord> =
  z.object({
    id: IdSchema,
    contestId: ContestIdSchema,
    transcribedValue: z.string().nonempty(),
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
  });

/**
 * Write-in summary information for write-ins pending transcription.
 */
export interface WriteInSummaryEntryPendingTranscription {
  readonly status: 'pending';
  readonly contestId: ContestId;
  readonly writeInCount: number;
}

/**
 * Schema for {@link WriteInSummaryEntryPendingTranscription}.
 */
export const WriteInSummaryEntryPendingTranscriptionSchema: z.ZodSchema<WriteInSummaryEntryPendingTranscription> =
  z.object({
    status: z.literal('pending'),
    contestId: ContestIdSchema,
    writeInCount: z.number().int().nonnegative(),
  });

/**
 * Write-in summary information for transcribed write-ins.
 */
export interface WriteInSummaryEntryTranscribed {
  readonly status: 'transcribed';
  readonly contestId: ContestId;
  readonly writeInCount: number;
  readonly transcribedValue: string;
}

/**
 * Schema for {@link WriteInSummaryEntryTranscribed}.
 */
export const WriteInSummaryEntryTranscribedSchema: z.ZodSchema<WriteInSummaryEntryTranscribed> =
  z.object({
    status: z.literal('transcribed'),
    contestId: ContestIdSchema,
    writeInCount: z.number().int().nonnegative(),
    transcribedValue: z.string().nonempty(),
  });

/**
 * Write-in summary information for adjudicated write-ins.
 */
export interface WriteInSummaryEntryAdjudicated {
  readonly status: 'adjudicated';
  readonly contestId: ContestId;
  readonly writeInCount: number;
  readonly transcribedValue: string;
  readonly writeInAdjudication: WriteInAdjudicationRecord;
}

/**
 * Schema for {@link WriteInSummaryEntryAdjudicated}.
 */
export const WriteInSummaryEntryAdjudicatedSchema: z.ZodSchema<WriteInSummaryEntryAdjudicated> =
  z.object({
    status: z.literal('adjudicated'),
    contestId: ContestIdSchema,
    writeInCount: z.number().int().nonnegative(),
    transcribedValue: z.string().nonempty(),
    writeInAdjudication: WriteInAdjudicationRecordSchema,
  });

/**
 * Write-in summary information.
 */
export type WriteInSummaryEntry =
  | WriteInSummaryEntryPendingTranscription
  | WriteInSummaryEntryTranscribed
  | WriteInSummaryEntryAdjudicated;

/**
 * Schema for {@link WriteInSummaryEntry}.
 */
export const WriteInSummaryEntrySchema: z.ZodSchema<WriteInSummaryEntry> =
  z.union([
    WriteInSummaryEntryPendingTranscriptionSchema,
    WriteInSummaryEntryTranscribedSchema,
    WriteInSummaryEntryAdjudicatedSchema,
  ]);

/**
 * An option for selecting an adjudication value in the write-in adjudication
 * table.
 */
export interface WriteInAdjudicationTableOption {
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
  readonly enabled: boolean;
}

/**
 * Schema for {@link WriteInAdjudicationTableOption}.
 */
export const WriteInAdjudicationTableOptionSchema: z.ZodSchema<WriteInAdjudicationTableOption> =
  z.object({
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
    enabled: z.boolean(),
  });

/**
 * An option group for selecting an adjudication value in the write-in
 * adjudication table.
 */
export interface WriteInAdjudicationTableOptionGroup {
  readonly title: string;
  readonly options: readonly WriteInAdjudicationTableOption[];
}

/**
 * Schema for {@link WriteInAdjudicationTableOptionGroup}.
 */
export const WriteInAdjudicationTableOptionGroupSchema: z.ZodSchema<WriteInAdjudicationTableOptionGroup> =
  z.object({
    title: z.string().nonempty(),
    options: z.array(WriteInAdjudicationTableOptionSchema),
  });

/**
 * A row in the write-in adjudication table that has already been adjudicated.
 */
export interface WriteInAdjudicationTableAdjudicatedRow {
  readonly writeInCount: number;
  readonly transcribedValue: string;
  readonly writeInAdjudicationId: Id;
  readonly editable: boolean;
  readonly adjudicationOptionGroups: readonly WriteInAdjudicationTableOptionGroup[];
}

/**
 * Schema for {@link WriteInAdjudicationTableAdjudicatedRow}.
 */
export const WriteInAdjudicationTableAdjudicatedRowSchema: z.ZodSchema<WriteInAdjudicationTableAdjudicatedRow> =
  z.object({
    writeInCount: z.number().int().nonnegative(),
    transcribedValue: z.string().nonempty(),
    writeInAdjudicationId: IdSchema,
    editable: z.boolean(),
    adjudicationOptionGroups: z.array(
      WriteInAdjudicationTableOptionGroupSchema
    ),
  });

/**
 * Group of rows in the write-in adjudication table that have already been
 * adjudicated.
 */
export interface WriteInAdjudicationTableAdjudicatedRowGroup {
  readonly writeInCount: number;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
  readonly rows: readonly WriteInAdjudicationTableAdjudicatedRow[];
}

/**
 * Schema for {@link WriteInAdjudicationTableAdjudicatedRowGroup}.
 */
export const WriteInAdjudicationTableAdjudicatedRowGroupSchema: z.ZodSchema<WriteInAdjudicationTableAdjudicatedRowGroup> =
  z.object({
    writeInCount: z.number().int().nonnegative(),
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
    rows: z.array(WriteInAdjudicationTableAdjudicatedRowSchema),
  });

/**
 * A row in the write-in adjudication table that has not yet been adjudicated.
 */
export interface WriteInAdjudicationTableTranscribedRow {
  readonly writeInCount: number;
  readonly transcribedValue: string;
  readonly adjudicationOptionGroups: readonly WriteInAdjudicationTableOptionGroup[];
}

/**
 * Schema for {@link WriteInAdjudicationTableTranscribedRow}.
 */
export const WriteInAdjudicationTableTranscribedRowSchema: z.ZodSchema<WriteInAdjudicationTableTranscribedRow> =
  z.object({
    writeInCount: z.number().int().nonnegative(),
    transcribedValue: z.string().nonempty(),
    adjudicationOptionGroups: z.array(
      WriteInAdjudicationTableOptionGroupSchema
    ),
  });

/**
 * Group of rows in the write-in adjudication table that have not yet been
 * adjudicated.
 */
export interface WriteInAdjudicationTableTranscribedRowGroup {
  readonly writeInCount: number;
  readonly rows: readonly WriteInAdjudicationTableTranscribedRow[];
}

/**
 * Schema for {@link WriteInAdjudicationTableTranscribedRowGroup}.
 */
export const WriteInAdjudicationTableTranscribedRowGroupSchema: z.ZodSchema<WriteInAdjudicationTableTranscribedRowGroup> =
  z.object({
    writeInCount: z.number().int().nonnegative(),
    rows: z.array(WriteInAdjudicationTableTranscribedRowSchema),
  });

/**
 * Write-in adjudication table information, for use in adjudicating write-ins.
 */
export interface WriteInAdjudicationTable {
  readonly contestId: ContestId;
  readonly writeInCount: number;
  readonly adjudicated: readonly WriteInAdjudicationTableAdjudicatedRowGroup[];
  readonly transcribed: WriteInAdjudicationTableTranscribedRowGroup;
}

/**
 * Schema for {@link WriteInAdjudicationTable}.
 */
export const WriteInAdjudicationTableSchema: z.ZodSchema<WriteInAdjudicationTable> =
  z.object({
    contestId: ContestIdSchema,
    writeInCount: z.number().int().nonnegative(),
    adjudicated: z.array(WriteInAdjudicationTableAdjudicatedRowGroupSchema),
    transcribed: WriteInAdjudicationTableTranscribedRowGroupSchema,
  });

/**
 * A non-pending write-in summary entry.
 */
export type WriteInSummaryEntryNonPending =
  | WriteInSummaryEntryTranscribed
  | WriteInSummaryEntryAdjudicated;

/**
 * Schema for {@link WriteInSummaryEntryNonPending}.
 */
export const WriteInSummaryEntryNonPendingSchema: z.ZodSchema<WriteInSummaryEntryNonPending> =
  z.union([
    WriteInSummaryEntryTranscribedSchema,
    WriteInSummaryEntryAdjudicatedSchema,
  ]);

/**
 * Write-in image information.
 */
export interface WriteInImageEntry {
  readonly image: string;
  readonly ballotCoordinates: Rect;
  readonly contestCoordinates: Rect;
  readonly writeInCoordinates: Rect;
}

/**
 * Schema for {@link WriteInImageEntry}.
 */
export const WriteInImageEntrySchema: z.ZodSchema<WriteInImageEntry> = z.object(
  {
    image: z.string().nonempty(),
    ballotCoordinates: RectSchema,
    contestCoordinates: RectSchema,
    writeInCoordinates: RectSchema,
  }
);

/**
 * Cast vote record data for a given write in option.
 */
export interface CastVoteRecordData {
  readonly cvr: CastVoteRecord;
  readonly writeInId: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly electionId: Id;
}

/**
 * Convenience enum for the printable ballot types.
 */
export const PrintableBallotType = {
  Absentee: 'absentee',
  Precinct: 'standard',
} as const;

/**
 * Printable ballot types.
 */
export type PrintableBallotType =
  typeof PrintableBallotType[keyof typeof PrintableBallotType];

/**
 * Schema for {@link PrintableBallotType}.
 */
export const PrintableBallotTypeSchema = z.union([
  z.literal('absentee'),
  z.literal('standard'),
]);

/**
 * Ballot mode.
 */
export enum BallotMode {
  /** Real ballots to be used and scanned during an election */
  Official = 'live',
  /** Test ballots to be used and scanned during pre-election testing / L&A */
  Test = 'test',
  /** Sample ballots to be provided to voters ahead of an election */
  Sample = 'sample',
  /** Draft ballots to verify that an election definition has been properly configured */
  Draft = 'draft',
}

/**
 * The ballot type for the CVR files currently being handled.
 */
export enum CvrFileMode {
  /** Only working with real CVR files generated during an official election. */
  Official = 'live',
  /** Only working with test CVR files used during pre-election testing/L&A. */
  Test = 'test',
  /** No CVR files imported yet - file mode is not currently locked. */
  Unlocked = 'unlocked',
}

/**
 * Schema for {@link BallotMode}.
 */
export const BallotModeSchema = z.nativeEnum(BallotMode);

/**
 * Information about printed ballots.
 */
export interface PrintedBallot {
  readonly ballotStyleId: BallotStyleId;
  readonly precinctId: PrecinctId;
  readonly locales: BallotLocale;
  readonly ballotType: PrintableBallotType;
  readonly ballotMode: BallotMode;
  readonly numCopies: number;
}

/**
 * Schema for {@link PrintedBallot}.
 */
export const PrintedBallotSchema: z.ZodSchema<PrintedBallot> = z.object({
  ballotStyleId: BallotStyleIdSchema,
  precinctId: PrecinctIdSchema,
  locales: BallotLocaleSchema,
  ballotType: PrintableBallotTypeSchema,
  ballotMode: BallotModeSchema,
  numCopies: z.number().int().nonnegative(),
});

/**
 * Database record for a printed ballot.
 */
export interface PrintedBallotRecord extends PrintedBallot {
  readonly id: Id;
  readonly electionId: Id;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link PrintedBallotRecord}.
 */
export const PrintedBallotRecordSchema: z.ZodSchema<PrintedBallotRecord> = z
  .object({
    id: IdSchema,
    electionId: IdSchema,
    ballotStyleId: BallotStyleIdSchema,
    precinctId: PrecinctIdSchema,
    locales: BallotLocaleSchema,
    ballotType: PrintableBallotTypeSchema,
    ballotMode: BallotModeSchema,
    numCopies: z.number().int().min(1),
    createdAt: Iso8601TimestampSchema,
  })
  .strict();
