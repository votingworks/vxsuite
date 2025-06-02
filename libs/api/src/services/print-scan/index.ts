import { z } from 'zod/v4';

export type SimpleStatus =
  | 'no_paper'
  | 'paper_ready_to_load' // Paper is detected in the input area
  | 'parking_paper'
  | 'paper_parked'
  | 'printing_ballot'
  | 'ballot_printed'
  | 'ejecting';

export const SimpleStatusSchema: z.ZodSchema<SimpleStatus> = z.union([
  z.literal('no_paper'),
  z.literal('paper_ready_to_load'),
  z.literal('parking_paper'),
  z.literal('paper_parked'),
  z.literal('printing_ballot'),
  z.literal('ballot_printed'),
  z.literal('ejecting'),
]);

export type SimpleServerStatus = SimpleStatus | 'no_hardware';

export const SimpleServerStatusSchema: z.ZodSchema<SimpleServerStatus> =
  z.union([SimpleStatusSchema, z.literal('no_hardware')]);

/**
 * @url /print-scan/status
 * @method GET
 */
export interface StatusResponse {
  status: SimpleServerStatus;
}

/**
 * @url /print-scan/status
 * @method GET
 */
export const StatusResponseSchema: z.ZodSchema<StatusResponse> = z.object({
  status: SimpleServerStatusSchema,
});

/**
 * @url /print-scan/print
 * @method POST
 */
export type PrintRequest = Uint8Array;
