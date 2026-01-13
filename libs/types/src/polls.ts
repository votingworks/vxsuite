import { z } from 'zod/v4';

export const PollsStateSchema = z.union([
  z.literal('polls_closed_initial'),
  z.literal('polls_open'),
  z.literal('polls_paused'),
  z.literal('polls_closed_final'),
]);

export type PollsState = z.infer<typeof PollsStateSchema>;

export type PollsStateSupportsLiveReporting =
  | 'polls_open'
  | 'polls_closed_final';

export function doesPollsStateSupportLiveReporting(
  state: PollsState
): state is PollsStateSupportsLiveReporting {
  return state === 'polls_open' || state === 'polls_closed_final';
}

export const StandardPollsTransitionTypeSchema = z.union([
  z.literal('open_polls'),
  z.literal('close_polls'),
]);

export type StandardPollsTransitionType = z.infer<
  typeof StandardPollsTransitionTypeSchema
>;

export const PollsSuspensionTransitionTypeSchema = z.union([
  z.literal('pause_voting'),
  z.literal('resume_voting'),
]);

export type PollsSuspensionTransitionType = z.infer<
  typeof PollsSuspensionTransitionTypeSchema
>;

export const PollsTransitionTypeSchema = z.union([
  StandardPollsTransitionTypeSchema,
  PollsSuspensionTransitionTypeSchema,
]);

export type PollsTransitionType = z.infer<typeof PollsTransitionTypeSchema>;
