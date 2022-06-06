import {
  AdjudicationId,
  AdjudicationIdSchema,
  ContestId,
  ContestIdSchema,
} from '@votingworks/types';
import * as z from 'zod';
import { ErrorsResponse, ErrorsResponseSchema, OkResponse } from '../../base';

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
 * @url /admin/write-ins/adjudication/transcribe
 * @method PATCH
 */
export interface PatchAdjudicationTranscribedValueRequest {
  adjudicationId: AdjudicationId;
  transcribedValue: string;
}

/**
 * @url /admin/write-ins/adjudication/transcribe
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueRequestSchema: z.ZodSchema<PatchAdjudicationTranscribedValueRequest> =
  z.object({
    adjudicationId: AdjudicationIdSchema,
    transcribedValue: z.string(),
  });

/**
 * @url /admin/write-ins/adjudication/transcribe
 * @method PATCH
 */
export type PatchAdjudicationTranscribedValueResponse =
  | OkResponse
  | ErrorsResponse;

/**
 * @url /admin/write-ins/adjudication/transcribe
 * @method PATCH
 */
export const PatchAdjudicationTranscribedValueResponseSchema: z.ZodSchema<PatchAdjudicationTranscribedValueResponse> =
  z.union([
    z.object({
      status: z.literal('ok'),
    }),
    ErrorsResponseSchema,
  ]);
