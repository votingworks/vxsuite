import {
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
  Rect,
  RectSchema,
  safeParseNumber,
} from '@votingworks/types';
import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  OkResponse,
  OkResponseSchema,
} from '../../base';

/**
 * An election definition and associated DB metadata.
 */
export interface ElectionRecord {
  readonly id: Id;
  readonly electionDefinition: ElectionDefinition;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link ElectionRecord}.
 */
export const ElectionRecordSchema: z.ZodSchema<ElectionRecord> = z.object({
  id: IdSchema,
  electionDefinition: ElectionDefinitionSchema,
  createdAt: Iso8601TimestampSchema,
});

/**
 * A cast vote record file's metadata.
 */
export interface CastVoteRecordFileMetadata {
  readonly id: Id;
  readonly electionId: Id;
  readonly filename: string;
  readonly sha256Hash: string;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link CastVoteRecordFileMetadata}.
 */
export const CastVoteRecordFileMetadataSchema: z.ZodSchema<CastVoteRecordFileMetadata> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    filename: z.string().nonempty(),
    sha256Hash: z.string().nonempty(),
    createdAt: Iso8601TimestampSchema,
  });

/**
 * A cast vote record file and associated DB metadata.
 */
export interface CastVoteRecordFileRecord extends CastVoteRecordFileMetadata {
  readonly data: string;
}

/**
 * Schema for {@link CastVoteRecordFileRecord}.
 */
export const CastVoteRecordFileRecordSchema: z.ZodSchema<CastVoteRecordFileRecord> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    filename: z.string().nonempty(),
    data: z.string(),
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
}

/**
 * Schema for {@link WriteInAdjudicationTableOption}.
 */
export const WriteInAdjudicationTableOptionSchema: z.ZodSchema<WriteInAdjudicationTableOption> =
  z.object({
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
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
 * @url /admin/elections
 * @method GET
 */
export type GetElectionsRequest = never;

/**
 * @url /admin/elections
 * @method GET
 */
export const GetElectionsRequestSchema = z.never();

/**
 * @url /admin/elections
 * @method GET
 */
export type GetElectionsResponse = ElectionRecord[];

/**
 * @url /admin/elections
 * @method GET
 */
export const GetElectionsResponseSchema = z.array(ElectionRecordSchema);

/**
 * @url /admin/elections
 * @method POST
 */
export type PostElectionRequest = ElectionDefinition;

/**
 * @url /admin/elections
 * @method POST
 */
export const PostElectionRequestSchema = ElectionDefinitionSchema;

/**
 * @url /admin/elections
 * @method POST
 */
export type PostElectionResponse = ErrorsResponse | OkResponse<{ id: Id }>;

/**
 * @url /admin/elections
 * @method POST
 */
export const PostElectionResponseSchema = z.union([
  ErrorsResponseSchema,
  z.object({
    status: z.literal('ok'),
    id: IdSchema,
  }),
]);

/**
 * @url /admin/elections
 * @method DELETE
 */
export type DeleteElectionRequest = never;

/**
 * @url /admin/elections
 * @method DELETE
 */
export const DeleteElectionRequestSchema = z.never();

/**
 * @url /admin/elections
 * @method DELETE
 */
export type DeleteElectionResponse = ErrorsResponse | OkResponse;

/**
 * @url /admin/elections
 * @method DELETE
 */
export const DeleteElectionResponseSchema = z.union([
  ErrorsResponseSchema,
  OkResponseSchema,
]);

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method POST
 */
export type PostCvrFileRequest = never;

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method POST
 */
export const PostCvrFileRequestSchema: z.ZodSchema<PostCvrFileRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method POST
 */
export type PostCvrFileResponse =
  | OkResponse<{
      id: Id;
      wasExistingFile: boolean;
      newlyAdded: number;
      alreadyPresent: number;
    }>
  | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method POST
 */
export const PostCvrFileResponseSchema: z.ZodSchema<PostCvrFileResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      id: IdSchema,
      wasExistingFile: z.boolean(),
      newlyAdded: z.number().int().nonnegative(),
      alreadyPresent: z.number().int().nonnegative(),
    }),
    ErrorsResponseSchema,
  ]);

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method POST
 */
export interface PostCvrFileQueryParams {
  readonly analyzeOnly?: boolean;
}

/**
 * Schema for {@link PostCvrFileQueryParams}.
 */
export const PostCvrFileQueryParamsSchema: z.ZodSchema<PostCvrFileQueryParams> =
  z
    .object({
      analyzeOnly: z
        .preprocess((value: unknown) => value === 'true', z.boolean())
        .optional(),
    })
    .strict();

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method DELETE
 */
export type DeleteCvrFileRequest = never;

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method DELETE
 */
export const DeleteCvrFileRequestSchema: z.ZodSchema<DeleteCvrFileRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/cvr-files
 * @method DELETE
 */
export type DeleteCvrFileResponse = OkResponse | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/cvrs
 * @method DELETE
 */
export const DeleteCvrFileResponseSchema: z.ZodSchema<DeleteCvrFileResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /admin/:electionId/cvr-files
 * @method GET
 */
export type GetCvrFilesRequest = never;

/**
 * @url /admin/:electionId/cvr-files
 * @method GET
 */
export const GetCvrFilesRequestSchema: z.ZodSchema<GetCvrFilesRequest> =
  z.never();

/**
 * @url /admin/:electionId/cvr-files
 * @method GET
 */
export type GetCvrFileResponse = CastVoteRecordFileMetadata[];

/**
 * @url /admin/:electionId/cvr-files
 * @method GET
 */
export const GetCvrFileResponseSchema: z.ZodSchema<GetCvrFileResponse> =
  z.array(CastVoteRecordFileRecordSchema);

/**
 * @url /admin/elections/:electionId/write-ins
 * @method GET
 */
export type GetWriteInsRequest = never;

/**
 * @url /admin/elections/:electionId/write-ins
 * @method GET
 */
export const GetWriteInsRequestSchema: z.ZodSchema<GetWriteInsRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/write-ins
 * @method GET
 */
export type GetWriteInsResponse = WriteInRecord[] | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/write-ins
 * @method GET
 */
export const GetWriteInsResponseSchema: z.ZodSchema<GetWriteInsResponse> =
  z.union([z.array(WriteInsRecordSchema), ErrorsResponseSchema]);

/**
 * @url /admin/elections/:electionId/write-ins
 * @method GET
 */
export interface GetWriteInsQueryParams {
  readonly contestId?: ContestId;
  readonly status?: WriteInAdjudicationStatus;
  readonly limit?: number;
}

/**
 * Schema for {@link GetWriteInsQueryParams}.
 */
export const GetWriteInsQueryParamsSchema: z.ZodSchema<GetWriteInsQueryParams> =
  z
    .object({
      contestId: ContestIdSchema.optional(),
      status: WriteInAdjudicationStatusSchema.optional(),
      limit: z
        .preprocess(
          (value) => safeParseNumber(value).unsafeUnwrap(),
          z.number().nonnegative().int()
        )
        .optional(),
    })
    .strict();

/**
 * @url /admin/write-ins/:writeInId/transcription
 * @method PUT
 */
export interface PutWriteInTranscriptionRequest {
  readonly value: string;
}

/**
 * Schema for {@link PutWriteInTranscriptionRequest}.
 */
export const PutWriteInTranscriptionRequestSchema: z.ZodSchema<PutWriteInTranscriptionRequest> =
  z.object({
    value: z.string(),
  });

/**
 * @url /admin/write-ins/:writeInId/transcription
 * @method PUT
 */
export type PutWriteInTranscriptionResponse = OkResponse | ErrorsResponse;

/**
 * Schema for {@link PutWriteInTranscriptionResponse}.
 */
export const PutWriteInTranscriptionResponseSchema: z.ZodSchema<PutWriteInTranscriptionResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);

/**
 * @url /admin/elections/:electionId/write-in-adjudications
 * @method GET
 */
export type GetWriteInAdjudicationsRequest = never;

/**
 * Schema for {@link GetWriteInAdjudicationsRequest}.
 */
export const GetWriteInAdjudicationsRequestSchema: z.ZodSchema<GetWriteInAdjudicationsRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/write-in-adjudications
 * @method GET
 */
export type GetWriteInAdjudicationsResponse =
  | WriteInAdjudicationRecord[]
  | ErrorsResponse;

/**
 * Schema for {@link GetWriteInAdjudicationsResponse}.
 */
export const GetWriteInAdjudicationsResponseSchema: z.ZodSchema<GetWriteInAdjudicationsResponse> =
  z.union([z.array(WriteInAdjudicationRecordSchema), ErrorsResponseSchema]);

/**
 * @url /admin/elections/:electionId/write-in-adjudications
 * @method GET
 */
export interface GetWriteInAdjudicationsQueryParams {
  readonly contestId?: ContestId;
}

/**
 * Schema for {@link GetWriteInAdjudicationsQueryParams}.
 */
export const GetWriteInAdjudicationsQueryParamsSchema: z.ZodSchema<GetWriteInAdjudicationsQueryParams> =
  z
    .object({
      contestId: ContestIdSchema.optional(),
    })
    .strict();

/**
 * @url /admin/elections/:electionId/write-in-adjudications
 * @method POST
 */
export interface PostWriteInAdjudicationRequest {
  readonly contestId: ContestId;
  readonly transcribedValue: string;
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * Schema for {@link PostWriteInAdjudicationRequest}.
 */
export const PostWriteInAdjudicationRequestSchema: z.ZodSchema<PostWriteInAdjudicationRequest> =
  z.object({
    contestId: ContestIdSchema,
    transcribedValue: z.string().nonempty(),
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
  });

/**
 * @url /admin/elections/:electionId/write-in-adjudications
 * @method POST
 */
export type PostWriteInAdjudicationResponse =
  | OkResponse<{ id: Id }>
  | ErrorsResponse;

/**
 * Schema for {@link PostWriteInAdjudicationResponse}.
 */
export const PostWriteInAdjudicationResponseSchema: z.ZodSchema<PostWriteInAdjudicationResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      id: IdSchema,
    }),
    ErrorsResponseSchema,
  ]);

/**
 * @url /admin/write-in-adjudications/:writeInAdjudicationId
 * @method PUT
 */
export interface PutWriteInAdjudicationRequest {
  readonly adjudicatedValue: string;
  readonly adjudicatedOptionId?: ContestOptionId;
}

/**
 * Schema for {@link PutWriteInAdjudicationRequest}.
 */
export const PutWriteInAdjudicationRequestSchema: z.ZodSchema<PutWriteInAdjudicationRequest> =
  z.object({
    adjudicatedValue: z.string().nonempty(),
    adjudicatedOptionId: ContestOptionIdSchema.optional(),
  });

/**
 * @url /admin/write-in-adjudications/:writeInAdjudicationId
 * @method PUT
 */
export type PutWriteInAdjudicationResponse = OkResponse | ErrorsResponse;

/**
 * Schema for {@link PutWriteInAdjudicationResponse}.
 */
export const PutWriteInAdjudicationResponseSchema: z.ZodSchema<PutWriteInAdjudicationResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      id: IdSchema,
    }),
    ErrorsResponseSchema,
  ]);

/**
 * @url /admin/write-in-adjudications/:writeInAdjudicationId
 * @method DELETE
 */
export type DeleteWriteInAdjudicationRequest = never;

/**
 * Schema for {@link DeleteWriteInAdjudicationRequest}.
 */
export const DeleteWriteInAdjudicationRequestSchema: z.ZodSchema<DeleteWriteInAdjudicationRequest> =
  z.never();

/**
 * @url /admin/write-in-adjudications/:writeInAdjudicationId
 * @method DELETE
 */
export type DeleteWriteInAdjudicationResponse = OkResponse;

/**
 * Schema for {@link DeleteWriteInAdjudicationResponse}.
 */
export const DeleteWriteInAdjudicationResponseSchema: z.ZodSchema<DeleteWriteInAdjudicationResponse> =
  OkResponseSchema;

/**
 * @url /admin/elections/:electionId/write-in-summary
 * @method GET
 */
export type GetWriteInSummaryRequest = never;

/**
 * Schema for {@link GetWriteInSummaryRequest}.
 */
export const GetWriteInSummaryRequestSchema: z.ZodSchema<GetWriteInSummaryRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/write-in-summary
 * @method GET
 */
export type GetWriteInSummaryResponse = WriteInSummaryEntry[] | ErrorsResponse;

/**
 * Schema for {@link GetWriteInSummaryResponse}.
 */
export const GetWriteInSummaryResponseSchema: z.ZodSchema<GetWriteInSummaryResponse> =
  z.array(WriteInSummaryEntrySchema);

/**
 * @url /admin/elections/:electionId/write-in-summary
 * @method GET
 */
export interface GetWriteInSummaryQueryParams {
  readonly contestId?: ContestId;
  readonly status?: WriteInAdjudicationStatus;
}

/**
 * Schema for {@link GetWriteInSummaryQueryParams}.
 */
export const GetWriteInSummaryQueryParamsSchema: z.ZodSchema<GetWriteInSummaryQueryParams> =
  z
    .object({
      contestId: ContestIdSchema.optional(),
      status: WriteInAdjudicationStatusSchema.optional(),
    })
    .strict();

/**
 * @url /admin/elections/:electionId/contests/:contestId/write-in-adjudication-table
 * @method GET
 */
export type GetWriteInAdjudicationTableRequest = never;

/**
 * Schema for {@link GetWriteInAdjudicationTableRequest}.
 */
export const GetWriteInAdjudicationTableRequestSchema: z.ZodSchema<GetWriteInAdjudicationTableRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/contests/:contestId/write-in-adjudication-table
 * @method GET
 */
export type GetWriteInAdjudicationTableResponse =
  | OkResponse<{ table: WriteInAdjudicationTable }>
  | ErrorsResponse;

/**
 * Schema for {@link GetWriteInAdjudicationTableResponse}.
 */
export const GetWriteInAdjudicationTableResponseSchema: z.ZodSchema<GetWriteInAdjudicationTableResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      table: WriteInAdjudicationTableSchema,
    }),
    ErrorsResponseSchema,
  ]);

/**
 * @url /admin/elections/:electionId/contests/:contestId/write-in-adjudication-table
 * @method GET
 */
export interface GetWriteInAdjudicationTableUrlParams {
  readonly electionId: Id;
  readonly contestId: ContestId;
}

/**
 * Schema for {@link GetWriteInAdjudicationTableUrlParams}.
 */
export const GetWriteInAdjudicationTableUrlParamsSchema: z.ZodSchema<GetWriteInAdjudicationTableUrlParams> =
  z.object({
    electionId: IdSchema,
    contestId: ContestIdSchema,
  });

/**
 * @url /admin/elections/:electionId/cvr-file/:cvrId/write-in-image
 * @method GET
 */
export type GetWriteInImageRequest = never;

/**
 * Schema for {@link GetWriteInImageRequest}.
 */
export const GetWriteInImageRequestSchema: z.ZodSchema<GetWriteInImageRequest> =
  z.never();

/**
 * @url /admin/elections/:electionId/cvr-file/:cvrId/write-in-image
 * @method GET
 */
export type GetWriteInImageResponse = WriteInImageEntry[] | ErrorsResponse;

/**
 * Schema for {@link GetWriteInImageResponse}.
 */
export const GetWriteInImageResponseSchema: z.ZodSchema<GetWriteInImageResponse> =
  z.array(WriteInImageEntrySchema);
