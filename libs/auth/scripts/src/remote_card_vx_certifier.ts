import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { extractErrorMessage } from '@votingworks/basics';

import { PROD_VX_CERT_AUTHORITY_CERT_PATH } from '../../src/config';
import { createCertGivenCertSigningRequest } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';

interface ScriptEnvVars {
  inputFilePath: string;
  vxPrivateKeyPath: string;
}

function readScriptEnvVars(): ScriptEnvVars {
  const inputFilePath = getRequiredEnvVar('INPUT_FILE_PATH');
  const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');
  return { inputFilePath, vxPrivateKeyPath };
}

async function remoteCardVxCertifier({
  inputFilePath,
  vxPrivateKeyPath,
}: ScriptEnvVars): Promise<void> {
  const input = JSON.parse(await fs.readFile(inputFilePath, 'utf-8'));
  const cert = await createCertGivenCertSigningRequest({
    certPublicKeyOverride: input.certPublicKeyOverride
      ? Buffer.from(input.certPublicKeyOverride, 'utf-8')
      : undefined,
    certSigningRequest: Buffer.from(input.certSigningRequest, 'utf-8'),
    certType: input.certType,
    expiryInDays: input.expiryInDays,
    signingCertAuthorityCertPath: PROD_VX_CERT_AUTHORITY_CERT_PATH,
    signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
  });
  await fs.writeFile(
    inputFilePath.replace('csr-', 'cert-').replace('.json', '.pem'),
    cert
  );
}

/**
 * A script for programming a vendor card. Uses the NODE_ENV env var to determine whether to
 * program a production or development card.
 */
export async function main(): Promise<void> {
  try {
    const { inputFilePath, vxPrivateKeyPath } = readScriptEnvVars();
    await remoteCardVxCertifier({ inputFilePath, vxPrivateKeyPath });
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
