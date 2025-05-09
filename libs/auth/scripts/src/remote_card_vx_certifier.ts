import { extractErrorMessage } from '@votingworks/basics';

import {
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
} from '../../src/certs';
import { PROD_VX_CERT_AUTHORITY_CERT } from '../../src/config';
import {
  cryptographicBufferToFile,
  pemFile,
} from '../../src/cryptographic_material';
import { createCert } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';

interface ScriptEnvVars {
  certPublicKeyPath: string;
  vxPrivateKeyPath: string;
}

function readScriptEnvVars(): ScriptEnvVars {
  const certPublicKeyPath = getRequiredEnvVar('CERT_PUBLIC_KEY_PATH');
  const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');
  return { certPublicKeyPath, vxPrivateKeyPath };
}

async function remoteCardVxCertifier({
  certPublicKeyPath,
  vxPrivateKeyPath,
}: ScriptEnvVars): Promise<void> {
  const vxPrivateKey = pemFile('private_key', vxPrivateKeyPath);
  const certPublicKey = pemFile('public_key', certPublicKeyPath);
  const certPath = certPublicKeyPath.replace('public-key-', 'cert-');
  await cryptographicBufferToFile(
    await createCert({
      certKeyInput: certPublicKey,
      certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
      expiryInDays: CERT_EXPIRY_IN_DAYS.CARD_VX_CERT,
      signingCertAuthorityCert: PROD_VX_CERT_AUTHORITY_CERT,
      signingPrivateKey: vxPrivateKey,
    }),
    certPath
  );
  console.log(
    `✅ Cert written to ${certPath} and can be shared with the sender of the public key`
  );
}

/**
 * A script for creating a card VotingWorks-issued cert given a card public key. Pairs with
 * the configure-java-card script when that script is run with VX_PRIVATE_KEY_PATH=remote
 */
export async function main(): Promise<void> {
  try {
    const scriptEnvVars = readScriptEnvVars();
    await remoteCardVxCertifier(scriptEnvVars);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
