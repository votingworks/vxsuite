import {
  ContestId,
  ContestIdSchema,
  ContestOptionId,
  ContestOptionIdSchema,
  ElectionDefinition,
  ElectionDefinitionSchema,
  Id,
  IdSchema,
  safeParseNumber,
} from '@votingworks/types';
import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  OkResponse,
  OkResponseSchema,
} from '../../base';
import {
  CastVoteRecordFileRecord,
  CastVoteRecordFileRecordSchema,
  ElectionRecord,
  ElectionRecordSchema,
  WriteInAdjudicationRecord,
  WriteInAdjudicationRecordSchema,
  WriteInAdjudicationStatus,
  WriteInAdjudicationStatusSchema,
  WriteInAdjudicationTable,
  WriteInAdjudicationTableSchema,
  WriteInImageEntry,
  WriteInImageEntrySchema,
  WriteInRecord,
  WriteInsRecordSchema,
  WriteInSummaryEntry,
  WriteInSummaryEntrySchema,
} from './types';

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
export type GetCvrFileResponse = CastVoteRecordFileRecord[];

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

/**
 * Schema for {@link GenerateCardPinRequest}.
 */
export const GenerateCardPinRequestSchema = z.never();

/**
 * @url /admin/pins/generate-card-pin
 * @method POST
 */
export type GenerateCardPinRequest = z.TypeOf<
  typeof GenerateCardPinRequestSchema
>;

/**
 * Schema for {@link GenerateCardPinResponse}.
 */
export const GenerateCardPinResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    pin: z.string(),
  }),
  ErrorsResponseSchema,
]);

/**
 * @url /admin/pins/generate-card-pin
 * @method POST
 */
export type GenerateCardPinResponse = z.TypeOf<
  typeof GenerateCardPinResponseSchema
>;
