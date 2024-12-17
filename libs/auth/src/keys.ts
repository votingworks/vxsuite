import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';

/**
 * An SSL key stored in a file
 */
export interface FileKey {
  source: 'file';
  path: string;
  passphraseFilePath?: string;
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
  passphraseFilePath: z.string().optional(),
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

/**
 * The ID of the TPM signing key, distinct from the TPM primary key
 */
const TPM_KEY_ID = '0x81000001';

/**
 * The name of the OpenSSL provider that we're using to interface with the TPM
 */
const TPM_OPENSSL_PROVIDER = 'tpm2';

/**
 * Prepares the OpenSSL params necessary to use a key
 */
export function opensslKeyParams(
  opensslParam: '-CAkey' | '-inkey' | '-key',
  key: FileKey | InlineKey | TpmKey
): Array<string | Buffer> {
  switch (key.source) {
    case 'file': {
      return [
        opensslParam,
        key.path,
        ...(key.passphraseFilePath
          ? ['-passin', `file:${key.passphraseFilePath}`]
          : []),
      ];
    }
    case 'inline': {
      return [opensslParam, Buffer.from(key.content, 'utf-8')];
    }
    case 'tpm': {
      return [
        opensslParam,
        `handle:${TPM_KEY_ID}`,
        // This propquery tells OpenSSL to prefer the TPM provider but fall back to the default
        // provider for operations outside the scope of the TPM provider, like reading files.
        '-propquery',
        `?provider=${TPM_OPENSSL_PROVIDER}`,
      ];
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(key, 'source');
    }
  }
}
