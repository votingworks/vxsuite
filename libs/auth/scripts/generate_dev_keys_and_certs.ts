/* eslint-disable no-console */
import { Buffer } from 'buffer';
import { promises as fs } from 'fs';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { UserWithCard } from '@votingworks/types';
import { asBoolean } from '@votingworks/utils';

import {
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  constructMachineCertSubject,
  DEV_JURISDICTION,
  STANDARD_CERT_FIELDS,
} from '../src/certs';
import { DEV_PRIVATE_KEY_PASSWORD } from '../src/java_card_config';
import {
  certPemToDer,
  createCert,
  openssl,
  publicKeyPemToDer,
} from '../src/openssl';
import { runCommand } from './utils';

const OPENSSL_CONFIG_PATH = './certs/openssl.cnf';

async function generateDevPrivateKey(): Promise<Buffer> {
  const privateKeyBase = await openssl([
    'ecparam',
    '-genkey',
    '-name',
    'prime256v1',
    '-noout',
  ]);
  const privateKey = await openssl([
    'pkcs8',
    '-topk8',
    '-in',
    privateKeyBase,
    '-passout',
    `pass:${DEV_PRIVATE_KEY_PASSWORD}`,
  ]);
  return privateKey;
}

async function extractPublicKeyFromDevPrivateKey(
  privateKeyPath: string
): Promise<Buffer> {
  return await openssl([
    'ec',
    '-pubout',
    '-in',
    privateKeyPath,
    '-passin',
    `pass:${DEV_PRIVATE_KEY_PASSWORD}`,
  ]);
}

/**
 * Generates a dev VotingWorks cert authority cert, our one self-signed cert
 */
async function generateDevVxCertAuthorityCert(
  vxPrivateKeyPath: string
): Promise<Buffer> {
  return await openssl([
    'req',
    '-new',
    '-x509',
    '-config',
    OPENSSL_CONFIG_PATH,
    '-key',
    vxPrivateKeyPath,
    '-passin',
    `pass:${DEV_PRIVATE_KEY_PASSWORD}`,
    '-subj',
    `/${STANDARD_CERT_FIELDS.join('/')}/`,
    '-days',
    `${CERT_EXPIRY_IN_DAYS.DEV}`,
  ]);
}

async function generateDevVxAndVxAdminKeysAndCerts({
  forTests,
  outputDir,
}: {
  forTests?: boolean;
  outputDir: string;
}): Promise<void> {
  runCommand(['mkdir', '-p', outputDir]);
  const vxPrivateKeyPath = `${outputDir}/vx-private-key.pem`;
  const vxCertAuthorityCertPath = `${outputDir}/vx-cert-authority-cert.pem`;
  const vxAdminPrivateKeyPath = `${outputDir}/vx-admin-private-key.pem`;
  const vxAdminCertAuthorityCertPath = `${outputDir}/vx-admin-cert-authority-cert.pem`;

  // Generate VotingWorks private key and cert authority cert
  const vxPrivateKey = await generateDevPrivateKey();
  await fs.writeFile(vxPrivateKeyPath, vxPrivateKey);
  const vxCertAuthorityCert = await generateDevVxCertAuthorityCert(
    vxPrivateKeyPath
  );
  await fs.writeFile(vxCertAuthorityCertPath, vxCertAuthorityCert);

  // Generate VxAdmin private key and cert authority cert
  const vxAdminPrivateKey = await generateDevPrivateKey();
  await fs.writeFile(vxAdminPrivateKeyPath, vxAdminPrivateKey);
  const vxAdminPublicKey = await extractPublicKeyFromDevPrivateKey(
    vxAdminPrivateKeyPath
  );
  const vxAdminCertAuthorityCert = await createCert({
    certSubject: constructMachineCertSubject('admin', DEV_JURISDICTION),
    certType: 'certAuthorityCert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    opensslConfig: OPENSSL_CONFIG_PATH,
    publicKeyToSign: vxAdminPublicKey,
    signingCertAuthorityCert: vxCertAuthorityCertPath,
    signingPrivateKey: vxPrivateKeyPath,
    signingPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
  });
  await fs.writeFile(vxAdminCertAuthorityCertPath, vxAdminCertAuthorityCert);

  if (forTests) {
    // Save VxAdmin cert authority cert in DER format
    await fs.writeFile(
      vxAdminCertAuthorityCertPath.replace('.pem', '.der'),
      await certPemToDer(vxAdminCertAuthorityCert)
    );

    const { electionHash } = electionFamousNames2021Fixtures.electionDefinition;
    const users: UserWithCard[] = [
      { role: 'system_administrator' },
      { role: 'election_manager', electionHash },
      { role: 'poll_worker', electionHash },
    ];
    for (const user of users) {
      const prefix = user.role.replace('_', '-');
      const cardVxPrivateKeyPath = `${outputDir}/${prefix}-card-vx-private-key.pem`;
      const cardVxPublicKeyPath = `${outputDir}/${prefix}-card-vx-public-key.der`;
      const cardVxCertPath = `${outputDir}/${prefix}-card-vx-cert.der`;
      const cardVxAdminPrivateKeyPath = `${outputDir}/${prefix}-card-vx-admin-private-key.pem`;
      const cardVxAdminPublicKeyPath = `${outputDir}/${prefix}-card-vx-admin-public-key.der`;
      const cardVxAdminCertPath = `${outputDir}/${prefix}-card-vx-admin-cert.der`;

      // Generate card VotingWorks key pair and cert
      const cardVxPrivateKey = await generateDevPrivateKey();
      await fs.writeFile(cardVxPrivateKeyPath, cardVxPrivateKey);
      const cardVxPublicKey = await extractPublicKeyFromDevPrivateKey(
        cardVxPrivateKeyPath
      );
      await fs.writeFile(
        cardVxPublicKeyPath,
        await publicKeyPemToDer(cardVxPublicKey)
      );
      const cardVxCert = await createCert({
        certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        opensslConfig: OPENSSL_CONFIG_PATH,
        publicKeyToSign: cardVxPublicKey,
        signingCertAuthorityCert: vxCertAuthorityCertPath,
        signingPrivateKey: vxPrivateKeyPath,
        signingPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
      });
      await fs.writeFile(cardVxCertPath, await certPemToDer(cardVxCert));

      // Generate card VxAdmin key pair and cert
      const cardVxAdminPrivateKey = await generateDevPrivateKey();
      await fs.writeFile(cardVxAdminPrivateKeyPath, cardVxAdminPrivateKey);
      const cardVxAdminPublicKey = await extractPublicKeyFromDevPrivateKey(
        cardVxAdminPrivateKeyPath
      );
      await fs.writeFile(
        cardVxAdminPublicKeyPath,
        await publicKeyPemToDer(cardVxAdminPublicKey)
      );
      const cardVxAdminCert = await createCert({
        certSubject: constructCardCertSubject({
          jurisdiction: DEV_JURISDICTION,
          user,
        }),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        opensslConfig: OPENSSL_CONFIG_PATH,
        publicKeyToSign: cardVxAdminPublicKey,
        signingCertAuthorityCert: vxAdminCertAuthorityCertPath,
        signingPrivateKey: vxAdminPrivateKeyPath,
        signingPrivateKeyPassword: DEV_PRIVATE_KEY_PASSWORD,
      });
      await fs.writeFile(
        cardVxAdminCertPath,
        await certPemToDer(cardVxAdminCert)
      );
    }
  }
}

/**
 * A script for generating a dev:
 * - VotingWorks private key
 * - VotingWorks cert authority cert
 * - VxAdmin private key
 * - VxAdmin cert authority cert
 *
 * If the FOR_TESTS env var is set, the script will additionally:
 * - Save the VxAdmin cert authority cert in DER format
 *
 * And generate for each of a system administrator, election manager, and poll worker:
 * - A first card key pair
 * - A second card key pair
 * - A card VotingWorks cert by signing the first key pair's public key with the VotingWorks cert
 *   authority cert
 * - A card VxAdmin cert by signing the second key pair's public key with the VxAdmin cert
 *   authority cert
 */
export async function main(): Promise<void> {
  try {
    await generateDevVxAndVxAdminKeysAndCerts({
      forTests: asBoolean(process.env['FOR_TESTS']),
      outputDir: process.env['OUTPUT_DIR'] ?? './certs/dev',
    });
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  console.log('✅ Done!');
  process.exit(0);
}
