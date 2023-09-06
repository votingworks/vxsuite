import { z } from 'zod';

export type SimpleStatus =
  | 'not_accepting_paper'
  | 'accepting_paper'
  | 'loading_paper'
  | 'waiting_for_ballot_data'
  | 'printing_ballot'
  | 'presenting_ballot'
  | 'scanning'
  | 'interpreting'
  | 'ejecting_to_front'
  | 'ejecting_to_rear'
  | 'jammed'
  | 'jam_cleared'
  | 'resetting_state_machine_after_jam'
  | 'resetting_state_machine_after_success';

export const SimpleStatusSchema: z.ZodSchema<SimpleStatus> = z.union([
  z.literal('not_accepting_paper'),
  z.literal('accepting_paper'),
  z.literal('loading_paper'),
  z.literal('waiting_for_ballot_data'),
  z.literal('presenting_ballot'),
  z.literal('printing_ballot'),
  z.literal('scanning'),
  z.literal('interpreting'),
  z.literal('ejecting_to_front'),
  z.literal('ejecting_to_rear'),
  z.literal('jammed'),
  z.literal('jam_cleared'),
  z.literal('resetting_state_machine_after_jam'),
  z.literal('resetting_state_machine_after_success'),
]);

export type SimpleServerStatus = SimpleStatus | 'no_hardware';

export const SimpleServerStatusSchema: z.ZodSchema<SimpleServerStatus> =
  z.union([SimpleStatusSchema, z.literal('no_hardware')]);
