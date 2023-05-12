/**
 * The name of the OpenSSL TPM engine that we're using
 */
export const OPENSSL_TPM_ENGINE_NAME = 'tpm2tss';

/**
 * The ID of the TPM signing key, distinct from the TPM primary key
 */
export const TPM_KEY_ID = '0x81000001';

/**
 * The password of the TPM signing key. Not required for our security model, just required by
 * OpenSSL, hence the dummy password.
 */
export const TPM_KEY_PASSWORD = 'password';
