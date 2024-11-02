import { extractErrorMessage } from '@votingworks/basics';

import { constructMachineCertSubject, MachineType } from '../../src/certs';
import { createCertSigningRequest } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';

interface ScriptEnv {
  machineType: MachineType;
  machineId: string;
  jurisdiction?: string;
}

function readScriptEnvVars(): ScriptEnv {
  const machineType = getRequiredEnvVar('VX_MACHINE_TYPE');
  const machineId = getRequiredEnvVar('VX_MACHINE_ID');
  const jurisdiction =
    machineType === 'admin'
      ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
      : undefined;
  return { machineType, machineId, jurisdiction };
}

async function createProductionMachineCertSigningRequest({
  machineType,
  machineId,
  jurisdiction,
}: ScriptEnv): Promise<void> {
  const certSigningRequest = await createCertSigningRequest({
    certKey: { source: 'tpm' },
    certSubject: constructMachineCertSubject({
      machineType,
      machineId,
      jurisdiction,
    }),
  });
  process.stdout.write(certSigningRequest);
}

/**
 * A script for creating a production machine cert signing request, using the machine's TPM key
 */
export async function main(): Promise<void> {
  try {
    const scriptEnv = readScriptEnvVars();
    await createProductionMachineCertSigningRequest(scriptEnv);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
