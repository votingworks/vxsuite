import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

/**
 * The path to the openssl config file
 */
export const OPENSSL_CONFIG_FILE_PATH = path.join(
  __dirname,
  '../certs/openssl.cnf'
);

/**
 * The static header for a public key in DER format
 */
export const PUBLIC_KEY_IN_DER_FORMAT_HEADER = Buffer.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
  0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

type OpensslParam = string | Buffer;

/**
 * A convenience function for openssl shell commands. For file params, accepts Buffers containing
 * the file's contents. Writes these Buffers to temporary files in the specified (or default)
 * working directory and deletes these files after completion of the openssl command.
 *
 * The returned promise resolves if the shell command's exit status is 0 and rejects otherwise
 * (openssl cert and signature verification commands return non-zero exit statuses when
 * verification fails). The promise also rejects if cleanup of temporary files fails.
 *
 * Sample usage:
 * await openssl(['verify', '-CAfile', '/path/to/cert/authority/cert.pem', certToVerifyAsBuffer ]);
 */
export async function openssl(
  params: OpensslParam[],
  workingDirectory = '/tmp/openssl'
): Promise<Buffer> {
  const processedParams: string[] = [];
  const tempFilePaths: string[] = [];
  for (const param of params) {
    if (Buffer.isBuffer(param)) {
      // fs/promises doesn't include an `exists` function
      if (!existsSync(workingDirectory)) {
        await fs.mkdir(workingDirectory);
      }
      const tempFileName = uuid();
      const tempFilePath = `${workingDirectory}/${tempFileName}`;
      await fs.writeFile(tempFilePath, param);
      processedParams.push(tempFilePath);
      tempFilePaths.push(tempFilePath);
    } else {
      processedParams.push(param);
    }
  }

  return new Promise((resolve, reject) => {
    const opensslProcess = spawn('openssl', processedParams);

    let stdout: Buffer = Buffer.from([]);
    opensslProcess.stdout.on('data', (data) => {
      stdout = Buffer.concat([stdout, data]);
    });

    let stderr: Buffer = Buffer.from([]);
    opensslProcess.stderr.on('data', (data) => {
      stderr = Buffer.concat([stderr, data]);
    });

    opensslProcess.on('close', async (code) => {
      let cleanupError: unknown;
      try {
        await Promise.all(
          tempFilePaths.map((tempFilePath) => fs.unlink(tempFilePath))
        );
      } catch (error) {
        cleanupError = error;
      }
      if (code !== 0) {
        reject(
          new Error(`${stderr.toString('utf-8')}\n${stdout.toString('utf-8')}`)
        );
      } else if (cleanupError) {
        reject(cleanupError);
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * An alias of OpensslParam for clarity
 */
type FilePathOrBuffer = OpensslParam;

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

/**
 * Verifies that the first cert was signed by the second cert. Both certs should be in PEM format.
 * Throws an error if signature verification fails.
 */
export function verifyFirstCertWasSignedBySecondCert(
  cert1: FilePathOrBuffer,
  cert2: FilePathOrBuffer
): Promise<Buffer> {
  // -partial_chain allows for verification without a full cert chain (i.e. a chain of certs that
  // ends with a self-signed cert)
  return openssl(['verify', '-partial_chain', '-CAfile', cert2, cert1]);
}

/**
 * Verifies a challenge signature against an original challenge using a public key (in PEM format).
 * Throws an error if signature verification fails.
 */
export async function verifySignature({
  challenge,
  challengeSignature,
  publicKey,
}: {
  challenge: FilePathOrBuffer;
  challengeSignature: FilePathOrBuffer;
  publicKey: FilePathOrBuffer;
}): Promise<void> {
  await openssl([
    'dgst',
    '-sha256',
    '-verify',
    publicKey,
    '-signature',
    challengeSignature,
    challenge,
  ]);
}

/**
 * Creates a cert by signing a public key with a signing cert authority cert and private key. All
 * key and cert inputs should be in PEM format. The outputted cert will also be in PEM format.
 */
export async function createCert({
  certSubject,
  certType = 'standard',
  expiryInDays,
  publicKeyToSign,
  signingCertAuthorityCert,
  signingPrivateKey,
  signingPrivateKeyPassword,
}: {
  certSubject: string;
  certType?: 'standard' | 'certAuthorityCert';
  expiryInDays: number;
  publicKeyToSign: FilePathOrBuffer;
  signingCertAuthorityCert: FilePathOrBuffer;
  signingPrivateKey: FilePathOrBuffer;
  signingPrivateKeyPassword: string;
}): Promise<Buffer> {
  // TODO: Instead of using a throwaway private key to generate the cert signing request and
  // injecting the public key we want using -force_pubkey, have the relevant HSM (Java Card, TPM,
  // etc.) generate the cert signing request
  const throwawayPrivateKey = await openssl([
    'ecparam',
    '-genkey',
    '-name',
    'prime256v1',
    '-noout',
  ]);
  const certSigningRequest = await openssl([
    'req',
    '-new',
    '-config',
    OPENSSL_CONFIG_FILE_PATH,
    '-key',
    throwawayPrivateKey,
    '-subj',
    certSubject,
  ]);
  const cert = await openssl([
    'x509',
    '-req',
    '-CA',
    signingCertAuthorityCert,
    '-CAkey',
    signingPrivateKey,
    '-passin',
    `pass:${signingPrivateKeyPassword}`,
    '-CAcreateserial',
    '-in',
    certSigningRequest,
    '-force_pubkey',
    publicKeyToSign,
    '-days',
    `${expiryInDays}`,
    ...(certType === 'certAuthorityCert'
      ? ['-extensions', 'v3_ca', '-extfile', OPENSSL_CONFIG_FILE_PATH]
      : []),
  ]);
  return cert;
}
