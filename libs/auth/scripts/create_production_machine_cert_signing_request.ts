import { Buffer } from 'buffer';
import { assert } from '@votingworks/basics';

import { constructMachineCertSubject, MachineType } from '../src/certs';
import { getRequiredEnvVar } from '../src/env_vars';
import { createCertSigningRequest } from '../src/openssl';

const machineType = getRequiredEnvVar('VX_MACHINE_TYPE') as MachineType;
assert(
  machineType === 'admin' ||
    machineType === 'central-scan' ||
    machineType === 'mark' ||
    machineType === 'scan',
  'VX_MACHINE_TYPE should be one of admin, central-scan, mark, or scan'
);
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
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  process.stdout.write(certSigningRequest);
  process.exit(0);
}
