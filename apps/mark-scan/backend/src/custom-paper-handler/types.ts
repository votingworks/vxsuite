import { z } from 'zod';

export type SimpleStatus =
  | 'no_paper'
  | 'loading_paper'
  | 'waiting_for_ballot_data'
  | 'printing_ballot'
  | 'presenting_ballot'
  | 'scanning'
  | 'interpreting';

export const SimpleStatusSchema: z.ZodSchema<SimpleStatus> = z.union([
  z.literal('no_paper'),
  z.literal('loading_paper'),
  z.literal('waiting_for_ballot_data'),
  z.literal('presenting_ballot'),
  z.literal('printing_ballot'),
  z.literal('scanning'),
  z.literal('interpreting'),
]);

export type SimpleServerStatus = SimpleStatus | 'no_hardware';

export const SimpleServerStatusSchema: z.ZodSchema<SimpleServerStatus> =
  z.union([SimpleStatusSchema, z.literal('no_hardware')]);
