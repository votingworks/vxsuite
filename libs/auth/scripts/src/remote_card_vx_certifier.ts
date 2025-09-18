import fs from 'node:fs/promises';
import readline from 'node:readline/promises';
import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';

import {
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
} from '../../src/certs';
import { PROD_VX_CERT_AUTHORITY_CERT_PATH } from '../../src/config';
import { createCert } from '../../src/cryptography';
import { getRequiredEnvVar } from '../../src/env_vars';

interface ScriptEnvVars {
  certPublicKeyPath: string;
  certType: 'vx' | 'vendor';
  vxPrivateKeyPath: string;
}

function readScriptEnvVars(): ScriptEnvVars {
  const certPublicKeyPath = getRequiredEnvVar('CERT_PUBLIC_KEY_PATH');
  const certType = getRequiredEnvVar('CERT_TYPE');
  const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');

  assert(
    certType === 'vx' || certType === 'vendor',
    'CERT_TYPE must be one of vx or vendor'
  );

  return {
    certPublicKeyPath,
    certType,
    vxPrivateKeyPath,
  };
}

async function remoteCardVxCertifier({
  certPublicKeyPath,
  certType,
  vxPrivateKeyPath,
}: ScriptEnvVars): Promise<void> {
  if (certType === 'vendor') {
    console.log('Preparing vendor card identity cert');
  } else {
    console.log('Preparing card VotingWorks cert');
  }

  const certPublicKey = await fs.readFile(certPublicKeyPath, 'utf-8');
  const vendorCardJurisdictionCommentPrefix = '# Jurisdiction: ';
  let vendorCardJurisdiction: string = '';
  if (certType === 'vendor') {
    assert(
      certPublicKey.startsWith(vendorCardJurisdictionCommentPrefix),
      'Public key file is missing jurisdiction comment line necessary for ' +
        'vendor card identity cert creation'
    );
    vendorCardJurisdiction = assertDefined(
      certPublicKey
        .split('\n')[0]
        ?.slice(vendorCardJurisdictionCommentPrefix.length)
    );
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let response = '';
    while (response !== 'y' && response !== 'n') {
      response = await rl.question(
        `Confirm that the jurisdiction (${vendorCardJurisdiction}) is correct (y/n): `
      );
    }
    rl.close();
    if (response !== 'y') {
      throw new Error('Jurisdiction not confirmed');
    }
  } else {
    assert(
      !certPublicKey.startsWith(vendorCardJurisdictionCommentPrefix),
      'Public key file has a jurisdiction comment line suggesting that it is for ' +
        'vendor card identity cert creation, not card VotingWorks cert creation; ' +
        'check that CERT_TYPE is set correctly'
    );
  }

  const cert = await createCert({
    certKeyInput: {
      type: 'public',
      key: { source: 'inline', content: certPublicKey },
    },
    certSubject:
      certType === 'vendor'
        ? constructCardCertSubject({
            user: { role: 'vendor', jurisdiction: vendorCardJurisdiction },
          })
        : constructCardCertSubjectWithoutJurisdictionAndCardType(),
    expiryInDays:
      certType === 'vendor'
        ? CERT_EXPIRY_IN_DAYS.VENDOR_CARD_IDENTITY_CERT
        : CERT_EXPIRY_IN_DAYS.CARD_VX_CERT,
    signingCertAuthorityCertPath: PROD_VX_CERT_AUTHORITY_CERT_PATH,
    signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
  });
  const certPath = certPublicKeyPath.replace('public-key-', 'cert-');
  await fs.writeFile(certPath, cert);
  console.log(
    `✅ Cert written to ${certPath} and can be shared with the sender of the public key`
  );
}

/**
 * A script for creating either a card VotingWorks cert or a vendor card identity cert, given a
 * given a card public key. Pairs with the configure-java-card and program-vendor-java-card scripts
 * when those scripts are run with VX_PRIVATE_KEY_PATH=remote
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
