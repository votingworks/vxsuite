import * as z from 'zod';
import {
  ErrorsResponse,
  ErrorsResponseSchema,
  OkResponse,
  OkResponseSchema,
} from '../../base';

/**
 * @url /election
 * @method PUT
 */
export type PutElectionDataRequest = never;

/**
 * @url /election
 * @method PUT
 */
export const PutElectionDataRequestSchema: z.ZodSchema<PutElectionDataRequest> =
  z.never();

/**
 * @url /election
 * @method PUT
 */
export type PutElectionDataResponse = OkResponse | ErrorsResponse;

/**
 * @url /election
 * @method PUT
 */
export const PutElectionDataResponse: z.ZodSchema<PutElectionDataResponse> =
  z.union([OkResponseSchema, ErrorsResponseSchema]);
