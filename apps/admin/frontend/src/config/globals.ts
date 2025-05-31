import { unsafeParse } from '@votingworks/types';
import { z } from 'zod/v4';

export const TIME_FORMAT = 'MM/dd/yyyy hh:mm:ss a';

const NodeEnvSchema = z.union([
  z.literal('development'),
  z.literal('test'),
  z.literal('production'),
]);

export const NODE_ENV = unsafeParse(
  NodeEnvSchema,
  process.env.NODE_ENV ?? 'development'
);
