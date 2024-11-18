/**
 * The ID of the TPM signing key, distinct from the TPM primary key
 */
const TPM_KEY_ID = '0x81000001';

/**
 * The name of the OpenSSL provider that we're using to interface with the TPM
 */
const TPM_OPENSSL_PROVIDER = 'tpm2';

/**
 * Prepares the OpenSSL params necessary to use the TPM
 */
export function tpmOpensslParams(
  opensslParam: '-CAkey' | '-inkey' | '-key'
): string[] {
  return [
    opensslParam,
    `handle:${TPM_KEY_ID}`,
    // This propquery tells OpenSSL to prefer the TPM provider but fall back to the default
    // provider for operations outside the scope of the TPM provider, like reading files.
    '-propquery',
    `?provider=${TPM_OPENSSL_PROVIDER}`,
  ];
}
