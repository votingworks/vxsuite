import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Stream } from 'node:stream';
import { FileResult, fileSync } from 'tmp';
import { z } from 'zod';
import { throwIllegalValue } from '@votingworks/basics';
import { unsafeParse } from '@votingworks/types';

import {
  FileKey,
  FileKeySchema,
  InlineKey,
  InlineKeySchema,
  TpmKey,
  TpmKeySchema,
} from './keys';
import { runCommand } from './shell';
import { tpmOpensslParams } from './tpm';

/**
 * The static header for a public key in DER format
 */
export const PUBLIC_KEY_IN_DER_FORMAT_HEADER = Buffer.of(
  0x30,
  0x59,
  0x30,
  0x13,
  0x06,
  0x07,
  0x2a,
  0x86,
  0x48,
  0xce,
  0x3d,
  0x02,
  0x01,
  0x06,
  0x08,
  0x2a,
  0x86,
  0x48,
  0xce,
  0x3d,
  0x03,
  0x01,
  0x07,
  0x03,
  0x42,
  0x00
);

/**
 * When creating card certs, we use a throwaway private key to create the cert signing request
 * since we can't access/use Java Card private keys for this purpose. We set the cert key using
 * -force_pubkey in this case.
 */
const THROWAWAY_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIBf6X2JisC7M+vYNi2RPaHrDUGPGZxtY5sYszU6RAgsqoAoGCCqGSM49
AwEHoUQDQgAEHAj1wCr6aDNph19ibxPgmkbLTAje0o7XhrQIlmmgFMS06wxaP8NA
6gRPXUxm7gTFKR9PU6lMMBD8FMzmjBC0iA==
-----END EC PRIVATE KEY-----
`;

type OpensslParam = string | Buffer;

/**
 * A convenience function for OpenSSL shell commands. For file params, accepts Buffers containing
 * the file's contents. Writes these Buffers to temporary files and deletes these files after
 * completion of the OpenSSL command.
 *
 * The returned promise resolves if the shell command's exit status is 0 and rejects otherwise
 * (OpenSSL cert and signature verification commands return non-zero exit statuses when
 * verification fails). The promise also rejects if cleanup of temporary files fails.
 *
 * Sample usage:
 * await openssl(['verify', '-CAfile', '/path/to/cert/authority/cert.pem', certToVerifyAsBuffer]);
 */
export async function openssl(
  params: OpensslParam[],
  { stdin }: { stdin?: Stream } = {}
): Promise<Buffer> {
  const processedParams: string[] = [];
  const tempFileResults: FileResult[] = [];
  for (const param of params) {
    if (Buffer.isBuffer(param)) {
      const tempFile = fileSync();
      await fs.writeFile(tempFile.name, param);
      processedParams.push(tempFile.name);
      tempFileResults.push(tempFile);
    } else {
      processedParams.push(param);
    }
  }

  let stdout: Buffer;
  try {
    stdout = await runCommand(['openssl', ...processedParams], { stdin });
  } finally {
    for (const tempFile of tempFileResults) {
      tempFile.removeCallback();
    }
  }
  return stdout;
}

/**
 * Returns the path to the VotingWorks-specific extension of the default OpenSSL config file
 */
export function getConfigFilePath({ usingTpm }: { usingTpm: boolean }): string {
  return usingTpm
    ? path.join(__dirname, '../config/openssl.vx-tpm.cnf')
    : path.join(__dirname, '../config/openssl.vx.cnf');
}

/**
 * An alias for clarity
 */
type FilePathOrBuffer = string | Buffer;

/**
 * Converts a cert in DER format to PEM format
 */
export function certDerToPem(cert: FilePathOrBuffer): Promise<Buffer> {
  return openssl(['x509', '-inform', 'DER', '-outform', 'PEM', '-in', cert]);
}

/**
 * Converts a cert in PEM format to DER format
 */
export function certPemToDer(cert: FilePathOrBuffer): Promise<Buffer> {
  return openssl(['x509', '-inform', 'PEM', '-outform', 'DER', '-in', cert]);
}

/**
 * Converts an ECC public key in DER format to PEM format
 */
export function publicKeyDerToPem(
  publicKey: FilePathOrBuffer
): Promise<Buffer> {
  return openssl([
    'ec',
    '-inform',
    'DER',
    '-outform',
    'PEM',
    '-pubin',
    '-in',
    publicKey,
  ]);
}

/**
 * Converts an ECC public key in PEM format to DER format
 */
// Only used in a script so doesn't get covered by java_card.test.ts
/* istanbul ignore next */
export function publicKeyPemToDer(
  publicKey: FilePathOrBuffer
): Promise<Buffer> {
  return openssl([
    'ec',
    '-inform',
    'PEM',
    '-outform',
    'DER',
    '-pubin',
    '-in',
    publicKey,
  ]);
}

/**
 * Extracts a public key (in PEM format) from a cert (also in PEM format)
 */
export function extractPublicKeyFromCert(
  cert: FilePathOrBuffer
): Promise<Buffer> {
  return openssl(['x509', '-noout', '-pubkey', '-in', cert]);
}

const VERIFICATION_TIME_MARGIN_MINUTES = 10;

/**
 * Verifies that the first cert was signed by the second cert. Both certs should be in PEM format.
 * Throws an error if signature verification fails.
 */
export function verifyFirstCertWasSignedBySecondCert(
  cert1: FilePathOrBuffer,
  cert2: FilePathOrBuffer
): Promise<Buffer> {
  return openssl([
    'verify',
    // Setting an -attime in the future allows for verification of certs issued on machines with
    // clocks slightly ahead of the current machine's. Such certs would otherwise be temporarily
    // rejected, until the current machine's clock catches up to the cert start time.
    '-attime',
    `${Math.floor(Date.now() / 1000) + VERIFICATION_TIME_MARGIN_MINUTES * 60}`,
    // -partial_chain allows for verification without a full cert chain, i.e., a chain of certs that
    // ends with a self-signed cert.
    '-partial_chain',
    '-CAfile',
    cert2,
    cert1,
  ]);
}

/**
 * Verifies a message signature against an original message using a public key (in PEM format).
 * Throws an error if signature verification fails.
 */
export async function verifySignature({
  message,
  messageSignature,
  publicKey,
}: {
  message: FilePathOrBuffer | Stream;
  messageSignature: FilePathOrBuffer;
  publicKey: FilePathOrBuffer;
}): Promise<void> {
  const params = [
    'dgst',
    '-sha256',
    '-verify',
    publicKey,
    '-signature',
    messageSignature,
  ];
  if (typeof message === 'string' || Buffer.isBuffer(message)) {
    await openssl([...params, message]);
    return;
  }
  await openssl(params, { stdin: message });
}

//
// Cert creation functions
//

type CertType = 'cert_authority_cert' | 'standard_cert';

/**
 * Creates a cert signing request, or CSR
 */
export async function createCertSigningRequest({
  certKey,
  certSubject,
}: {
  certKey: FileKey | InlineKey | TpmKey;
  certSubject: string;
}): Promise<Buffer> {
  const keyParams: OpensslParam[] = (() => {
    switch (certKey.source) {
      case 'file': {
        return ['-key', certKey.path];
      }
      case 'inline': {
        return ['-key', Buffer.from(certKey.content, 'utf-8')];
      }
      case 'tpm': {
        return tpmOpensslParams('-key');
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(certKey, 'source');
      }
    }
  })();
  const usingTpm = certKey.source === 'tpm';
  const certSigningRequest = await openssl([
    'req',
    '-config',
    getConfigFilePath({ usingTpm }),
    '-new',
    ...keyParams,
    '-subj',
    certSubject,
  ]);
  return certSigningRequest;
}

/**
 * A wrapper function for the manage-openssl-config script. See the script for more details.
 */
export async function manageOpensslConfig(
  action: 'override-for-tpm-use' | 'restore-default',
  options: { addSudo?: boolean } = {}
): Promise<void> {
  const manageOpensslConfigScriptPath = path.join(
    __dirname,
    '../src/intermediate-scripts/manage-openssl-config'
  );
  const command = [manageOpensslConfigScriptPath, action];
  await runCommand(
    // The explicit sudo often isn't necessary because this function is being called in the context of
    // another sudo operation already, like a createCert call using the TPM.
    options.addSudo ? ['sudo', ...command] : command
  );
}

/**
 * Creates a cert given a cert signing request, or CSR. Supports overriding the cert public key if
 * the private key of the public key to certify was unavailable at the time of CSR creation, and a
 * throwaway private key was used.
 */
export async function createCertGivenCertSigningRequest({
  certPublicKeyOverride,
  certSigningRequest,
  certType = 'standard_cert',
  expiryInDays,
  signingCertAuthorityCertPath,
  signingPrivateKey,
}: {
  certPublicKeyOverride?: Buffer;
  certSigningRequest: Buffer;
  certType?: CertType;
  expiryInDays: number;
  signingCertAuthorityCertPath: string;
  signingPrivateKey: FileKey | TpmKey;
}): Promise<Buffer> {
  const certAuthorityKeyParams: OpensslParam[] = (() => {
    switch (signingPrivateKey.source) {
      case 'file': {
        return ['-CAkey', signingPrivateKey.path];
      }
      case 'tpm': {
        return tpmOpensslParams('-CAkey');
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(signingPrivateKey, 'source');
      }
    }
  })();
  const usingTpm = signingPrivateKey.source === 'tpm';
  let cert: Buffer;
  try {
    // The `openssl x509` command doesn't support the -config flag or OPENSSL_CONF environment
    // variable, so to use the TPM, we have to temporarily swap the default OpenSSL config file. We take
    // great care to restore the default config, using a finally block plus a fallback reset on
    // boot.
    // Note that we tried switching to the `openssl ca` command, which does support the -config
    // flag, but it doesn't support the -force_pubkey flag, which we need for card cert creation
    // because we don't have access to the card private keys nor is there an obvious API for
    // getting the card private keys to sign a CSR.
    if (usingTpm) {
      await manageOpensslConfig('override-for-tpm-use');
    }
    cert = await openssl([
      'x509',
      '-req',
      '-CA',
      signingCertAuthorityCertPath,
      ...certAuthorityKeyParams,
      '-CAcreateserial',
      '-CAserial',
      '/tmp/serial.txt',
      '-in',
      certSigningRequest,
      '-days',
      `${expiryInDays}`,
      ...(certPublicKeyOverride
        ? ['-force_pubkey', certPublicKeyOverride]
        : []),
      ...(certType === 'cert_authority_cert'
        ? ['-extfile', getConfigFilePath({ usingTpm }), '-extensions', 'v3_ca']
        : []),
    ]);
  } finally {
    if (usingTpm) {
      await manageOpensslConfig('restore-default');
    }
  }
  return cert;
}

/**
 * The input to createCert. All file keys, inline keys, and certs should be in PEM format.
 */
export interface CreateCertInput {
  /**
   * A private key should be provided when possible, but if the private key of the public key to
   * certify isn't available (as is the case for a key pair generated on a Java Card), the public
   * key is also acceptable. We set the cert key using -force_pubkey in this case.
   */
  certKeyInput:
    | { type: 'private'; key: FileKey }
    | { type: 'public'; key: InlineKey };
  certSubject: string;
  certType?: CertType;
  expiryInDays: number;
  signingCertAuthorityCertPath: string;
  signingPrivateKey: FileKey | TpmKey;
}

const CreateCertInputSchema: z.ZodSchema<CreateCertInput> = z.object({
  certKeyInput: z.union([
    z.object({ type: z.literal('private'), key: FileKeySchema }),
    z.object({ type: z.literal('public'), key: InlineKeySchema }),
  ]),
  certSubject: z.string(),
  certType: z
    .union([z.literal('cert_authority_cert'), z.literal('standard_cert')])
    .optional(),
  expiryInDays: z.number(),
  signingCertAuthorityCertPath: z.string(),
  signingPrivateKey: z.union([FileKeySchema, TpmKeySchema]),
});

/**
 * Parses a JSON string as a CreateCertInput, throwing an error if parsing fails
 */
export function parseCreateCertInput(value: string): CreateCertInput {
  return unsafeParse(CreateCertInputSchema, JSON.parse(value));
}

/**
 * A helper for createCert. Creates a cert, combining cert signing request creation and cert
 * creation into a single function. The outputted cert will be in PEM format.
 */
export async function createCertHelper({
  certKeyInput,
  certSubject,
  certType = 'standard_cert',
  expiryInDays,
  signingCertAuthorityCertPath,
  signingPrivateKey,
}: CreateCertInput): Promise<Buffer> {
  const isPrivateKeyOfPublicKeyToCertifyUnavailable =
    certKeyInput.type === 'public';

  const certKey: FileKey | InlineKey =
    isPrivateKeyOfPublicKeyToCertifyUnavailable
      ? { source: 'inline', content: THROWAWAY_PRIVATE_KEY }
      : certKeyInput.key;
  const certSigningRequest = await createCertSigningRequest({
    certKey,
    certSubject,
  });

  const certPublicKeyOverride = isPrivateKeyOfPublicKeyToCertifyUnavailable
    ? Buffer.from(certKeyInput.key.content, 'utf-8')
    : undefined;
  const cert = await createCertGivenCertSigningRequest({
    certPublicKeyOverride,
    certSigningRequest,
    certType,
    expiryInDays,
    signingCertAuthorityCertPath,
    signingPrivateKey,
  });

  return cert;
}

/**
 * Creates a cert, combining cert signing request creation and cert creation into a single
 * function. The outputted cert will be in PEM format.
 *
 * Uses a slightly roundabout control flow for permissions purposes:
 *
 * createCert() --> ../src/intermediate-scripts/create-cert --> createCertHelper()
 *
 * When using TPM keys in production, we need sudo access. Creating the intermediate create-cert
 * script allows us to grant password-less sudo access to the relevant system users for just that
 * operation, instead of having to grant password-less sudo access more globally.
 */
export async function createCert(input: CreateCertInput): Promise<Buffer> {
  const scriptPath = path.join(
    __dirname,
    '../src/intermediate-scripts/create-cert'
  );
  const scriptInput = JSON.stringify(input);
  const usingTpm = input.signingPrivateKey.source === 'tpm';
  const command = usingTpm
    ? ['sudo', scriptPath, scriptInput]
    : [scriptPath, scriptInput];
  return runCommand(command);
}

//
// Message signing functions
//

/**
 * The input to signMessage. File keys should be in PEM format.
 */
export interface SignMessageInput {
  /**
   * We use streaming APIs to process the message since the message could be large and infeasible
   * to store in memory (i.e. in a Buffer), e.g. the message might include the contents of a
   * multi-GB zip file.
   *
   * A seeming alternative would be to require a file path since the openssl command streams under
   * the hood, but many of our messages will include the contents of a file preceded by a custom
   * prefix, so there is no file path to provide (unless a temporary file is created, which too
   * would have to be done with streaming APIs).
   */
  message: Stream;
  signingPrivateKey: FileKey | TpmKey;
}

/**
 * The input to signMessage, excluding the message
 */
export type SignMessageInputExcludingMessage = Omit<
  SignMessageInput,
  'message'
>;

const SignMessageInputExcludingMessageSchema: z.ZodSchema<SignMessageInputExcludingMessage> =
  z.object({
    signingPrivateKey: z.union([FileKeySchema, TpmKeySchema]),
  });

/**
 * Parses a JSON string as a SignMessageInputExcludingMessage, throwing an error if parsing fails
 */
export function parseSignMessageInputExcludingMessage(
  value: string
): SignMessageInputExcludingMessage {
  return unsafeParse(SignMessageInputExcludingMessageSchema, JSON.parse(value));
}

/**
 * A helper for signMessage. Digitally signs data from the standard input using the specified
 * private key.
 */
export async function signMessageHelper({
  signingPrivateKey,
}: SignMessageInputExcludingMessage): Promise<Buffer> {
  // While it's possible to hash and sign with a single OpenSSL command, we separate the two
  // actions. Hashing large inputs with the TPM can be extremely slow, so in production, we hash
  // using the main processor and only sign using the TPM. We perform the hashing with OpenSSL and
  // not the Node crypto module because it's easier to make the former FIPS compliant than the
  // latter.
  const hash = await openssl(['dgst', '-sha256', '-binary'], {
    stdin: process.stdin,
  });

  const inKeyParams: OpensslParam[] = (() => {
    switch (signingPrivateKey.source) {
      case 'file': {
        return ['-inkey', signingPrivateKey.path];
      }
      case 'tpm': {
        return tpmOpensslParams('-inkey');
      }
      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(signingPrivateKey, 'source');
      }
    }
  })();
  const usingTpm = signingPrivateKey.source === 'tpm';
  const signature = await openssl(
    [
      'pkeyutl',
      ...(usingTpm ? ['-config', getConfigFilePath({ usingTpm })] : []),
      '-sign',
      ...inKeyParams,
    ],
    {
      // Though small and not a stream, still pass the hash through the standard input to avoid
      // having to temporarily write it to disk
      stdin: Readable.from(hash),
    }
  );

  return signature;
}

/**
 * Digitally signs a message using the specified private key.
 *
 * Uses a slightly roundabout control flow for permissions purposes:
 *
 * signMessage() --> ../src/intermediate-scripts/sign-message --> signMessageHelper()
 *
 * When using TPM keys in production, we need sudo access. Creating the intermediate sign-message
 * script allows us to grant password-less sudo access to the relevant system users for just that
 * operation, instead of having to grant password-less sudo access more globally.
 */
export async function signMessage({
  message,
  ...inputExcludingMessage
}: SignMessageInput): Promise<Buffer> {
  const scriptPath = path.join(
    __dirname,
    '../src/intermediate-scripts/sign-message'
  );
  const scriptInput = JSON.stringify(inputExcludingMessage);
  const usingTpm = inputExcludingMessage.signingPrivateKey.source === 'tpm';
  const command = usingTpm
    ? ['sudo', scriptPath, scriptInput]
    : [scriptPath, scriptInput];
  return runCommand(command, { stdin: message });
}
