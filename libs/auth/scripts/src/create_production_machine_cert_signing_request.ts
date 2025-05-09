import { extractErrorMessage } from '@votingworks/basics';

import { constructMachineCertSubject, MachineType } from '../../src/certs';
import { tpmPrivateKey } from '../../src/cryptographic_material';
import { createCertSigningRequest } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';

interface ScriptEnvVars {
  machineType: MachineType;
  machineId: string;
  jurisdiction?: string;
}

function readScriptEnvVars(): ScriptEnvVars {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  const machineId = getRequiredEnvVar('VX_MACHINE_ID');
  const jurisdiction =
    machineType === 'admin' || machineType === 'poll-book'
      ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
      : undefined;
  return { machineType, machineId, jurisdiction };
}

async function createProductionMachineCertSigningRequest({
  machineType,
  machineId,
  jurisdiction,
}: ScriptEnvVars): Promise<void> {
  const certSigningRequest = await createCertSigningRequest({
    certPrivateKey: tpmPrivateKey,
    certSubject: constructMachineCertSubject({
      machineType,
      machineId,
      jurisdiction,
    }),
  });
  process.stdout.write(certSigningRequest.content);
}

/**
 * A script for creating a production machine cert signing request, using the machine's TPM key
 */
export async function main(): Promise<void> {
  try {
    const scriptEnvVars = readScriptEnvVars();
    await createProductionMachineCertSigningRequest(scriptEnvVars);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
