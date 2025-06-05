import { Buffer } from 'node:buffer';
import { z } from 'zod/v4';
import { throwIllegalValue } from '@votingworks/basics';
import { asBoolean } from '@votingworks/utils';

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
 * An SSL key in someone else's possession
 */
export interface RemoteKey {
  source: 'remote';
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
 * A Zod schema for RemoteKey
 */
export const RemoteKeySchema: z.ZodSchema<RemoteKey> = z.object({
  source: z.literal('remote'),
});

/**
 * A Zod schema for TpmKey
 */
export const TpmKeySchema: z.ZodSchema<TpmKey> = z.object({
  source: z.literal('tpm'),
});

/**
 * The ID of the TPM key used for auth operations
 */
const TPM_KEY_ID = '0x81000001';

/**
 * The ID of the TPM key used to secure strongSwan on VxPollBook
 */
const STRONGSWAN_TPM_KEY_ID = '0x81010003';

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
      return [opensslParam, key.path];
    }
    case 'inline': {
      return [opensslParam, Buffer.from(key.content, 'utf-8')];
    }
    case 'tpm': {
      const tpmKeyId = asBoolean(process.env.USE_STRONGSWAN_TPM_KEY)
        ? STRONGSWAN_TPM_KEY_ID
        : TPM_KEY_ID;
      return [
        opensslParam,
        `handle:${tpmKeyId}`,
        // This propquery tells OpenSSL to prefer the TPM provider but fall back to the default
        // provider for operations outside the scope of the TPM provider, like reading files.
        '-propquery',
        `?provider=${TPM_OPENSSL_PROVIDER}`,
      ];
    }
    /* istanbul ignore next: Compile-time check for completeness - @preserve */
    default: {
      throwIllegalValue(key, 'source');
    }
  }
}
