import { Buffer } from 'node:buffer';
import { extractErrorMessage } from '@votingworks/basics';

import { createCertHelper, parseCreateCertInput } from '../cryptography';

/**
 * An intermediate component of createCert in src/openssl.ts, needed for permissions purposes. See
 * createCert for more context.
 */
export async function main(): Promise<void> {
  let cert: Buffer;
  try {
    cert = await createCertHelper(parseCreateCertInput(process.argv[2] ?? ''));
  } catch (error) {
    process.stderr.write(extractErrorMessage(error));
    process.exit(1);
  }
  process.stdout.write(cert);
  process.exit(0);
}
