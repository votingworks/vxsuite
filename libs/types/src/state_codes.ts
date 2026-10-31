import { z } from 'zod/v4';

export const StateCodes = ['DEMO', 'MI', 'MS', 'NH'] as const;
export type StateCode = (typeof StateCodes)[number];
export const StateCodeSchema: z.ZodType<StateCode> = z.enum(StateCodes);
