import { z } from 'zod';

export type SimpleStatus =
  | 'accepting_paper'
  | 'ejecting_to_front'
  | 'ejecting_to_rear'
  | 'interpreting'
  | 'invalidating_ballot'
  | 'jam_cleared'
  | 'jammed'
  | 'loading_paper'
  | 'not_accepting_paper'
  | 'presenting_ballot'
  | 'printing_ballot'
  | 'resetting_state_machine_after_jam'
  | 'resetting_state_machine_after_success'
  | 'scanning'
  | 'waiting_for_ballot_data';

export const SimpleStatusSchema: z.ZodSchema<SimpleStatus> = z.union([
  z.literal('accepting_paper'),
  z.literal('ejecting_to_front'),
  z.literal('ejecting_to_rear'),
  z.literal('interpreting'),
  z.literal('invalidating_ballot'),
  z.literal('jam_cleared'),
  z.literal('jammed'),
  z.literal('loading_paper'),
  z.literal('not_accepting_paper'),
  z.literal('presenting_ballot'),
  z.literal('printing_ballot'),
  z.literal('resetting_state_machine_after_jam'),
  z.literal('resetting_state_machine_after_success'),
  z.literal('scanning'),
  z.literal('waiting_for_ballot_data'),
]);

export type SimpleServerStatus = SimpleStatus | 'no_hardware';

export const SimpleServerStatusSchema: z.ZodSchema<SimpleServerStatus> =
  z.union([SimpleStatusSchema, z.literal('no_hardware')]);
