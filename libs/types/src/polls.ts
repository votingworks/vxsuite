import * as z from 'zod';

export type PollsState =
  | 'polls_closed_initial'
  | 'polls_open'
  | 'polls_paused'
  | 'polls_closed_final';

export const PollsStateSchema: z.ZodSchema<PollsState> = z.union([
  z.literal('polls_closed_initial'),
  z.literal('polls_open'),
  z.literal('polls_paused'),
  z.literal('polls_closed_final'),
]);

export type StandardPollsTransition = 'open_polls' | 'close_polls';
export type PollsSuspensionTransition = 'pause_voting' | 'resume_voting';
export type PollsTransition =
  | StandardPollsTransition
  | PollsSuspensionTransition;

export const StandardPollsTransitionSchema: z.ZodSchema<StandardPollsTransition> =
  z.union([z.literal('open_polls'), z.literal('close_polls')]);
export const PollsSuspensionTransitionSchema: z.ZodSchema<PollsSuspensionTransition> =
  z.union([z.literal('pause_voting'), z.literal('resume_voting')]);
export const PollsTransitionSchema: z.ZodSchema<PollsTransition> = z.union([
  StandardPollsTransitionSchema,
  PollsSuspensionTransitionSchema,
]);
