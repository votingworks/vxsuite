import { extractErrorMessage } from '@votingworks/basics';

import { CertPemBuffer } from '../cryptographic_material';
import { createCertHelper, deserializeCreateCertInput } from '../cryptography';

/**
 * An intermediate component of createCert in src/cryptography.ts, needed for permissions purposes.
 * See createCert for more context.
 */
export async function main(): Promise<void> {
  let cert: CertPemBuffer;
  try {
    cert = await createCertHelper(
      deserializeCreateCertInput(process.argv[2] ?? '')
    );
  } catch (error) {
    process.stderr.write(extractErrorMessage(error));
    process.exit(1);
  }
  process.stdout.write(cert.content);
  process.exit(0);
}
