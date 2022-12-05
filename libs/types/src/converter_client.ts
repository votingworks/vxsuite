import { z } from 'zod';

export type ConverterClientType = 'ms-sems' | 'nh-accuvote';

export const ConverterClientTypeSchema = z.union([
  z.literal('ms-sems'),
  z.literal('nh-accuvote'),
]);
