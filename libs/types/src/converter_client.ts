import { z } from 'zod/v4';

export type ConverterClientType = 'ms-sems';

export const ConverterClientTypeSchema = z.literal('ms-sems');
