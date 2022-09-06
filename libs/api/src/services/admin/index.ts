import {
  CastVoteRecord,
  ContestId,
  ContestIdSchema,
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
  id: Id;
  electionDefinition: ElectionDefinition;
  createdAt: Iso8601Timestamp;
  updatedAt: Iso8601Timestamp;
}

/**
 * Schema for {@link ElectionRecord}.
 */
export const ElectionRecordSchema = z.object({
  id: IdSchema,
  electionDefinition: ElectionDefinitionSchema,
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
 * @url /admin/elections/:electionId/cvrs
 * @method POST
 */
export interface PostCvrsRequest {
  signature: string;
  name: string;
  precinctIds: string[];
  scannerIds: string[];
  timestamp: string;
  castVoteRecords: CastVoteRecord[];
}

/**
 * @url /admin/elections/:electionId/cvrs
 * @method POST
 */
export const PostCvrsRequestSchema: z.ZodSchema<PostCvrsRequest> = z.object({
  signature: z.string(),
  name: z.string(),
  precinctIds: z.array(z.string()),
  scannerIds: z.array(z.string()),
  timestamp: z.string(),
  castVoteRecords: z.array(z.any()), // TODO https://github.com/votingworks/vxsuite/issues/2168
});

/**
 * @url /admin/elections/:electionId/cvrs
 * @method POST
 */
export type PostCvrsResponse = OkResponse | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/cvrs
 * @method POST
 */
export const PostCvrsResponseSchema: z.ZodSchema<PostCvrsResponse> = z.union([
  z.object({
    status: z.literal('ok'),
  }),
  ErrorsResponseSchema,
]);
//

/**
 * @url /admin/elections/:electionId/adjudications
 * @method POST
 */
export interface PostAdjudicationRequest {
  contestId: ContestId;
}

/**
 * @url /admin/elections/:electionId/adjudications
 * @method POST
 */
export const PostAdjudicationRequestSchema: z.ZodSchema<PostAdjudicationRequest> =
  z.object({
    contestId: ContestIdSchema,
  });

/**
 * @url /admin/elections/:electionId/adjudications
 * @method POST
 */
export type PostAdjudicationResponse =
  | OkResponse<{ id: string }>
  | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/adjudication
 * @method POST
 */
export const PostAdjudicationResponseSchema: z.ZodSchema<PostAdjudicationResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
      id: z.string(),
    }),
    ErrorsResponseSchema,
  ]);

/**
 * @url /admin/elections/:electionId/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export interface PatchAdjudicationTranscribedValueRequest {
  transcribedValue: string;
}

/**
 * @url /admin/elections/:electionId/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueRequestSchema: z.ZodSchema<PatchAdjudicationTranscribedValueRequest> =
  z.object({
    transcribedValue: z.string(),
  });

/**
 * @url /admin/elections/:electionId/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export type PatchAdjudicationTranscribedValueResponse =
  | OkResponse
  | ErrorsResponse;

/**
 * @url /admin/elections/:electionId/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueResponseSchema: z.ZodSchema<PatchAdjudicationTranscribedValueResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
    }),
    ErrorsResponseSchema,
  ]);
