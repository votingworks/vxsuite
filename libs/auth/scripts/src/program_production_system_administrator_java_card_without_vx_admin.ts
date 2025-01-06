import fs from 'node:fs/promises';
import path from 'node:path';
import tmp from 'tmp';
import { extractErrorMessage } from '@votingworks/basics';
import { DEV_MACHINE_ID } from '@votingworks/types';

import {
  CERT_EXPIRY_IN_DAYS,
  constructMachineCertSubject,
} from '../../src/certs';
import { PROD_VX_CERT_AUTHORITY_CERT_PATH } from '../../src/config';
import { createCert } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';
import { JavaCard } from '../../src/java_card';
import { generatePrivateKey, programJavaCard } from './utils';

interface ScriptEnv {
  jurisdiction: string;
  vxPrivateKeyPath: string;
}

function readScriptEnvVars(): ScriptEnv {
  const jurisdiction = getRequiredEnvVar('VX_MACHINE_JURISDICTION');
  const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');
  return { jurisdiction, vxPrivateKeyPath };
}

async function instantiateJavaCardWithOneOffVxAdminPrivateKeyAndCertAuthorityCert(
  { jurisdiction, vxPrivateKeyPath }: ScriptEnv,
  tempDirectoryPath: string
): Promise<JavaCard> {
  const vxAdminPrivateKey = await generatePrivateKey();
  const vxAdminPrivateKeyPath = path.join(
    tempDirectoryPath,
    'vx-admin-private-key.pem'
  );
  await fs.writeFile(vxAdminPrivateKeyPath, vxAdminPrivateKey);

  const vxAdminCertAuthorityCert = await createCert({
    certKeyInput: {
      type: 'private',
      key: { source: 'file', path: vxAdminPrivateKeyPath },
    },
    certSubject: constructMachineCertSubject({
      machineType: 'admin',
      machineId: DEV_MACHINE_ID,
      jurisdiction,
    }),
    certType: 'cert_authority_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.MACHINE_VX_CERT,
    signingCertAuthorityCertPath: PROD_VX_CERT_AUTHORITY_CERT_PATH,
    signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
  });
  const vxAdminCertAuthorityCertPath = path.join(
    tempDirectoryPath,
    'vx-admin-cert-authority-cert.pem'
  );
  await fs.writeFile(vxAdminCertAuthorityCertPath, vxAdminCertAuthorityCert);

  const card = new JavaCard({
    cardProgrammingConfig: {
      configType: 'vx_admin',
      vxAdminCertAuthorityCertPath,
      vxAdminPrivateKey: { source: 'file', path: vxAdminPrivateKeyPath },
    },
    vxCertAuthorityCertPath: PROD_VX_CERT_AUTHORITY_CERT_PATH,
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
    const scriptEnv = readScriptEnvVars();
    const card =
      await instantiateJavaCardWithOneOffVxAdminPrivateKeyAndCertAuthorityCert(
        scriptEnv,
        tempDirectory.name
      );
    await programJavaCard({
      card,
      isProduction: true,
      user: {
        role: 'system_administrator',
        jurisdiction: scriptEnv.jurisdiction,
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
