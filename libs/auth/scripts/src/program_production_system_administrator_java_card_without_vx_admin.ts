import path from 'node:path';
import tmp from 'tmp';
import { extractErrorMessage } from '@votingworks/basics';
import { DEV_MACHINE_ID } from '@votingworks/types';

import {
  CERT_EXPIRY_IN_DAYS,
  constructMachineCertSubject,
} from '../../src/certs';
import { PROD_VX_CERT_AUTHORITY_CERT } from '../../src/config';
import {
  cryptographicBufferToFile,
  pemFile,
} from '../../src/cryptographic_material';
import { createCert } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';
import { JavaCard } from '../../src/java_card';
import { generatePrivateKey, programJavaCard } from './utils';

interface ScriptEnvVars {
  jurisdiction: string;
  vxPrivateKeyPath: string;
}

function readScriptEnvVars(): ScriptEnvVars {
  const jurisdiction = getRequiredEnvVar('VX_MACHINE_JURISDICTION');
  const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');
  return { jurisdiction, vxPrivateKeyPath };
}

async function instantiateJavaCardWithOneOffVxAdminPrivateKeyAndCertAuthorityCert(
  { jurisdiction, vxPrivateKeyPath }: ScriptEnvVars,
  tempDirectoryPath: string
): Promise<JavaCard> {
  const vxPrivateKey = pemFile('private_key', vxPrivateKeyPath);

  const vxAdminPrivateKeyPath = path.join(
    tempDirectoryPath,
    'vx-admin-private-key.pem'
  );
  const vxAdminPrivateKey = await cryptographicBufferToFile(
    await generatePrivateKey(),
    vxAdminPrivateKeyPath
  );

  const vxAdminCertAuthorityCertPath = path.join(
    tempDirectoryPath,
    'vx-admin-cert-authority-cert.pem'
  );
  const vxAdminCertAuthorityCert = await cryptographicBufferToFile(
    await createCert({
      certKeyInput: vxAdminPrivateKey,
      certSubject: constructMachineCertSubject({
        machineType: 'admin',
        machineId: DEV_MACHINE_ID,
        jurisdiction,
      }),
      certType: 'cert_authority_cert',
      expiryInDays: CERT_EXPIRY_IN_DAYS.MACHINE_VX_CERT,
      signingCertAuthorityCert: PROD_VX_CERT_AUTHORITY_CERT,
      signingPrivateKey: vxPrivateKey,
    }),
    vxAdminCertAuthorityCertPath
  );

  const card = new JavaCard({
    cardProgrammingConfig: {
      configType: 'machine',
      machineCertAuthorityCert: vxAdminCertAuthorityCert,
      machinePrivateKey: vxAdminPrivateKey,
    },
    vxCertAuthorityCert: PROD_VX_CERT_AUTHORITY_CERT,
  });

  return card;
}

/**
 * A script for programming a production system administrator Java Card without a VxAdmin. This is
 * useful for preparing backup cards after we've shipped a VxAdmin.
 */
export async function main(): Promise<void> {
  let exitCode: number = 0;
  let tempDirectory: tmp.DirResult | undefined;
  try {
    tempDirectory = tmp.dirSync({ unsafeCleanup: true });
    const scriptEnvVars = readScriptEnvVars();
    const card =
      await instantiateJavaCardWithOneOffVxAdminPrivateKeyAndCertAuthorityCert(
        scriptEnvVars,
        tempDirectory.name
      );
    await programJavaCard({
      card,
      isProduction: true,
      user: {
        role: 'system_administrator',
        jurisdiction: scriptEnvVars.jurisdiction,
        programmingMachineType: 'admin',
      },
    });
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    exitCode = 1;
  } finally {
    // Delete temp directory and contained files
    tempDirectory?.removeCallback();
  }
  // Smart card scripts require an explicit exit, even on success, or else they hang
  process.exit(exitCode);
}
