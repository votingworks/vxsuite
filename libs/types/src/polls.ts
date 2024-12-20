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

export type StandardPollsTransitionType = 'open_polls' | 'close_polls';
export type PollsSuspensionTransitionType = 'pause_voting' | 'resume_voting';
export type PollsTransitionType =
  | StandardPollsTransitionType
  | PollsSuspensionTransitionType;

export const StandardPollsTransitionTypeSchema: z.ZodSchema<StandardPollsTransitionType> =
  z.union([z.literal('open_polls'), z.literal('close_polls')]);
export const PollsSuspensionTransitionTypeSchema: z.ZodSchema<PollsSuspensionTransitionType> =
  z.union([z.literal('pause_voting'), z.literal('resume_voting')]);
export const PollsTransitionTypeSchema: z.ZodSchema<PollsTransitionType> =
  z.union([
    StandardPollsTransitionTypeSchema,
    PollsSuspensionTransitionTypeSchema,
  ]);
