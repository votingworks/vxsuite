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

export type PollsTransition =
  | 'open_polls'
  | 'pause_polls'
  | 'unpause_polls'
  | 'close_polls';

export const PollsTransitionSchema: z.ZodSchema<PollsTransition> = z.union([
  z.literal('open_polls'),
  z.literal('pause_polls'),
  z.literal('unpause_polls'),
  z.literal('close_polls'),
]);
