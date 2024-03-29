import { z } from 'zod';

export type SimpleStatus =
  | 'accepting_paper'
  | 'ballot_accepted'
  | 'ballot_removed_during_presentation'
  | 'blank_page_interpretation'
  | 'ejecting_to_front'
  | 'ejecting_to_rear'
  | 'empty_ballot_box'
  | 'interpreting'
  | 'jam_cleared'
  | 'jammed'
  | 'loading_paper'
  | 'not_accepting_paper'
  | 'paper_reloaded'
  | 'pat_device_connected'
  | 'presenting_ballot'
  | 'printing_ballot'
  | 'resetting_state_machine_no_delay'
  | 'resetting_state_machine_after_jam'
  | 'resetting_state_machine_after_success'
  | 'poll_worker_auth_ended_unexpectedly'
  | 'scanning'
  | 'transition_interpretation'
  | 'waiting_for_ballot_data'
  | 'waiting_for_invalidated_ballot_confirmation.paper_present'
  | 'waiting_for_invalidated_ballot_confirmation.paper_absent';

export const SimpleStatusSchema: z.ZodSchema<SimpleStatus> = z.union([
  z.literal('accepting_paper'),
  z.literal('ballot_accepted'),
  z.literal('ballot_removed_during_presentation'),
  z.literal('blank_page_interpretation'),
  z.literal('ejecting_to_front'),
  z.literal('ejecting_to_rear'),
  z.literal('empty_ballot_box'),
  z.literal('interpreting'),
  z.literal('jam_cleared'),
  z.literal('jammed'),
  z.literal('loading_paper'),
  z.literal('not_accepting_paper'),
  z.literal('paper_reloaded'),
  z.literal('pat_device_connected'),
  z.literal('presenting_ballot'),
  z.literal('printing_ballot'),
  z.literal('resetting_state_machine_no_delay'),
  z.literal('resetting_state_machine_after_jam'),
  z.literal('resetting_state_machine_after_success'),
  z.literal('poll_worker_auth_ended_unexpectedly'),
  z.literal('scanning'),
  z.literal('transition_interpretation'),
  z.literal('waiting_for_ballot_data'),
  z.literal('waiting_for_invalidated_ballot_confirmation.paper_present'),
  z.literal('waiting_for_invalidated_ballot_confirmation.paper_absent'),
]);

export type SimpleServerStatus = SimpleStatus | 'no_hardware';

export const SimpleServerStatusSchema: z.ZodSchema<SimpleServerStatus> =
  z.union([SimpleStatusSchema, z.literal('no_hardware')]);
