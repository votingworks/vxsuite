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
    '-provider',
    TPM_OPENSSL_PROVIDER,
    // When a provider is explicitly specified, the default OpenSSL provider is not automatically
    // loaded. But even when using the TPM OpenSSL provider, we still need the default provider for
    // operations outside the scope of the TPM provider. For example, when creating a cert, OpenSSL
    // needs to extract the public key from the cert signing request, which the TPM provider doesn't
    // support. See https://www.openssl.org/docs/man3.0/man7/OSSL_PROVIDER-default.html for more
    // context.
    '-provider',
    'default',
  ];
}
