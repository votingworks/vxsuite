import { Buffer } from 'buffer';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { v4 as uuid } from 'uuid';

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
        reject(new Error(stderr.toString()));
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
  return openssl(['verify', '-CAfile', cert2, cert1]);
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
    '-verify',
    publicKey,
    '-sha256',
    '-signature',
    challengeSignature,
    challenge,
  ]);
}
