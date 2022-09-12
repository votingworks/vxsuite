import {
  ElectionDefinition,
  ElectionDefinitionSchema,
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
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
  readonly updatedAt: Iso8601Timestamp;
}

/**
 * Schema for {@link ElectionRecord}.
 */
export const ElectionRecordSchema: z.ZodSchema<ElectionRecord> = z.object({
  id: IdSchema,
  electionDefinition: ElectionDefinitionSchema,
  createdAt: Iso8601TimestampSchema,
  updatedAt: Iso8601TimestampSchema,
});

/**
 * A cast vote record's metadata.
 */
export interface CastVoteRecordFileMetadata {
  readonly id: Id;
  readonly electionId: Id;
  readonly filename: string;
  readonly sha256Hash: string;
  readonly createdAt: Iso8601Timestamp;
  readonly updatedAt: Iso8601Timestamp;
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
    updatedAt: Iso8601TimestampSchema,
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
    updatedAt: Iso8601TimestampSchema,
  });

/**
 * A Cast Vote Record's metadata.
 */
export interface CastVoteRecordFileEntryRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly data: string;
  readonly createdAt: Iso8601Timestamp;
  readonly updatedAt: Iso8601Timestamp;
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
    updatedAt: Iso8601TimestampSchema,
  });

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
 * @url /admin/elections/:electionId/cvrs
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
