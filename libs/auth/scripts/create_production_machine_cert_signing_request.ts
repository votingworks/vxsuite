import { Buffer } from 'buffer';
import { extractErrorMessage } from '@votingworks/basics';

import { constructMachineCertSubject } from '../src/certs';
import { getRequiredEnvVar } from '../src/env_vars';
import { createCertSigningRequest } from '../src/openssl';

const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
const jurisdiction =
  machineType === 'admin'
    ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
    : undefined;

async function createProductionMachineCertSigningRequest(): Promise<Buffer> {
  return await createCertSigningRequest({
    certKey: { source: 'tpm' },
    certSubject: constructMachineCertSubject(machineType, jurisdiction),
  });
}

/**
 * A script for creating a production machine cert signing request, using the machine's TPM key
 */
export async function main(): Promise<void> {
  let certSigningRequest: Buffer;
  try {
    certSigningRequest = await createProductionMachineCertSigningRequest();
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
  process.stdout.write(certSigningRequest);
  process.exit(0);
}
