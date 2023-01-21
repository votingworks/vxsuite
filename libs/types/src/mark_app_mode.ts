import { z } from 'zod';

export const PrintOnly = {
  key: 'PrintOnly',
  productName: 'VxPrint',
  isMark: false,
  isPrint: true,
} as const;
export const MarkOnly = {
  key: 'MarkOnly',
  productName: 'VxMark',
  isMark: true,
  isPrint: false,
} as const;
export const MarkAndPrint = {
  key: 'MarkAndPrint',
  productName: 'VxMark',
  isPrint: true,
  isMark: true,
} as const;
export type AppMode = typeof MarkOnly | typeof PrintOnly | typeof MarkAndPrint;
export type AppModeKeys = AppMode['key'];
export const AppModeKeysSchema: z.ZodSchema<AppModeKeys> = z.union([
  z.literal(PrintOnly.key),
  z.literal(MarkOnly.key),
  z.literal(MarkAndPrint.key),
]);
