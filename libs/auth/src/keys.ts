import { z } from 'zod';

/**
 * An SSL key stored in a file
 */
export interface FileKey {
  source: 'file';
  path: string;
}

/**
 * An SSL key stored in code memory
 */
export interface InlineKey {
  source: 'inline';
  content: string;
}

/**
 * An SSL key stored in a TPM
 */
export interface TpmKey {
  source: 'tpm';
}

/**
 * A Zod schema for FileKey
 */
export const FileKeySchema: z.ZodSchema<FileKey> = z.object({
  source: z.literal('file'),
  path: z.string(),
});

/**
 * A Zod schema for InlineKey
 */
export const InlineKeySchema: z.ZodSchema<InlineKey> = z.object({
  source: z.literal('inline'),
  content: z.string(),
});

/**
 * A Zod schema for TpmKey
 */
export const TpmKeySchema: z.ZodSchema<TpmKey> = z.object({
  source: z.literal('tpm'),
});
