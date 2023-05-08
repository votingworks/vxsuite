import { z } from 'zod';

export type ConverterClientType = 'ms-sems';

export const ConverterClientTypeSchema = z.literal('ms-sems');
