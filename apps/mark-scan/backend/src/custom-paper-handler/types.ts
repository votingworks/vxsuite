import { z } from 'zod';

export const SimpleStatusSchema = z.union([
  z.literal('accepting_paper'),
  z.literal('accepting_paper_after_jam'),
  z.literal('ballot_accepted'),
  z.literal('ballot_removed_during_presentation'),
  z.literal('blank_page_interpretation'),
  z.literal('cover_open_unauthorized'),
  z.literal('ejecting_to_front'),
  z.literal('ejecting_to_rear'),
  z.literal('empty_ballot_box'),
  z.literal('inserted_invalid_new_sheet'),
  z.literal('inserted_preprinted_ballot'),
  z.literal('interpreting'),
  z.literal('jam_cleared'),
  z.literal('jammed'),
  z.literal('loading_new_sheet'),
  z.literal('loading_paper'),
  z.literal('loading_paper_after_jam'),
  z.literal('loading_reinserted_ballot'),
  z.literal('not_accepting_paper'),
  z.literal('paper_handler_diagnostic.auth_ended'),
  z.literal('paper_handler_diagnostic.eject_to_rear'),
  z.literal('paper_handler_diagnostic.failure'),
  z.literal('paper_handler_diagnostic.interpret_ballot'),
  z.literal('paper_handler_diagnostic.load_paper'),
  z.literal('paper_handler_diagnostic.print_ballot_fixture'),
  z.literal('paper_handler_diagnostic.prompt_for_paper'),
  z.literal('paper_handler_diagnostic.scan_ballot'),
  z.literal('paper_handler_diagnostic.success'),
  z.literal('paper_reloaded'),
  z.literal('pat_device_connected'),
  z.literal('poll_worker_auth_ended_unexpectedly'),
  z.literal('presenting_ballot'),
  z.literal('printing_ballot'),
  z.literal('reinserted_invalid_ballot'),
  z.literal('resetting_state_machine_after_jam'),
  z.literal('resetting_state_machine_after_success'),
  z.literal('resetting_state_machine_no_delay'),
  z.literal('validating_reinserted_ballot'),
  z.literal('scanning'),
  z.literal('transition_interpretation'),
  z.literal('validating_new_sheet'),
  z.literal('waiting_for_ballot_data'),
  z.literal('waiting_for_ballot_reinsertion'),
  z.literal('waiting_for_invalidated_ballot_confirmation.paper_absent'),
  z.literal('waiting_for_invalidated_ballot_confirmation.paper_present'),
  z.literal('waiting_for_voter_auth'),
]);

export type SimpleStatus = z.infer<typeof SimpleStatusSchema>;

export const SimpleServerStatusSchema = z.union([
  SimpleStatusSchema,
  z.literal('no_hardware'),
]);

export type SimpleServerStatus = z.infer<typeof SimpleServerStatusSchema>;
