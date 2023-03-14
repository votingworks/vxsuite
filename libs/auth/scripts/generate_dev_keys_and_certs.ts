/* eslint-disable no-console */
import { Buffer } from 'buffer';
import { promises as fs } from 'fs';

import {
  CERT_EXPIRY_IN_DAYS,
  constructMachineCertSubject,
  STANDARD_CERT_FIELDS,
} from '../src/certs';
import {
  DEV_JURISDICTION,
  DEV_PRIVATE_KEY_PASSWORD,
} from '../src/java_card_config';
import { createCert, openssl } from '../src/openssl';
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

async function generateDevVxAndVxAdminKeysAndCerts(
  outputDir: string
): Promise<void> {
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
}

/**
 * A script for generating a dev:
 * - VotingWorks private key
 * - VotingWorks cert authority cert
 * - VxAdmin private key
 * - VxAdmin cert authority cert
 */
export async function main(): Promise<void> {
  try {
    await generateDevVxAndVxAdminKeysAndCerts('./certs/dev');
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  console.log('✅ Done!');
  process.exit(0);
}
