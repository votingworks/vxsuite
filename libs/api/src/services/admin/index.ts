import { ContestId, ContestIdSchema } from '@votingworks/types';
import * as z from 'zod';
import { ErrorsResponse, ErrorsResponseSchema, OkResponse } from '../../base';

/**
 * @url /admin/write-ins/cvrs
 * @method POST
 */
export interface PostCvrsRequest {
  signature: string;
  name: string;
  precinctIds: string[];
  scannerIds: string[];
  timestamp: string;
  castVoteRecords: any[]; // TODO TV: This should be CastVoteRecord
}

/**
 * @url /admin/write-ins/cvrs
 * @method POST
 */
export const PostCvrsRequestSchema: z.ZodSchema<PostCvrsRequest> = z.object({
  signature: z.string(),
  name: z.string(),
  precinctIds: z.array(z.string()),
  scannerIds: z.array(z.string()),
  timestamp: z.string(),
  castVoteRecords: z.array(z.any()),
});

/**
 * @url /admin/write-ins/cvrs
 * @method POST
 */
export type PostCvrsResponse = OkResponse | ErrorsResponse;

/**
 * @url /admin/write-ins/cvrs
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
 * @url /admin/write-ins/adjudication
 * @method POST
 */
export interface PostAdjudicationRequest {
  contestId: ContestId;
}

/**
 * @url /admin/write-ins/adjudication
 * @method POST
 */
export const PostAdjudicationRequestSchema: z.ZodSchema<PostAdjudicationRequest> =
  z.object({
    contestId: ContestIdSchema,
  });

/**
 * @url /admin/write-ins/adjudication
 * @method POST
 */
export type PostAdjudicationResponse =
  | OkResponse<{ id: string }>
  | ErrorsResponse;

/**
 * @url /admin/write-ins/adjudication
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
 * @url /admin/write-ins/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export interface PatchAdjudicationTranscribedValueRequest {
  transcribedValue: string;
}

/**
 * @url /admin/write-ins/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueRequestSchema: z.ZodSchema<PatchAdjudicationTranscribedValueRequest> =
  z.object({
    transcribedValue: z.string(),
  });

/**
 * @url /admin/write-ins/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export type PatchAdjudicationTranscribedValueResponse =
  | OkResponse
  | ErrorsResponse;

/**
 * @url /admin/write-ins/adjudications/:adjudicationId/transcription
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueResponseSchema: z.ZodSchema<PatchAdjudicationTranscribedValueResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
    }),
    ErrorsResponseSchema,
  ]);
