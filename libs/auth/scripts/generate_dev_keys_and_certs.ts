/* eslint-disable no-console */
import { Buffer } from 'buffer';
import { promises as fs } from 'fs';
import yargs from 'yargs/yargs';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';

import { CardDetails } from '../src/card';
import {
  CardType,
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
  OPENSSL_CONFIG_FILE_PATH,
  publicKeyPemToDer,
} from '../src/openssl';
import { runCommand } from './utils';

async function generateDevPrivateKey(): Promise<Buffer> {
  const privateKey = await openssl([
    'ecparam',
    '-genkey',
    '-name',
    'prime256v1',
    '-noout',
  ]);
  const encryptedPrivateKey = await openssl([
    'pkcs8',
    '-topk8',
    '-in',
    privateKey,
    '-passout',
    `pass:${DEV_PRIVATE_KEY_PASSWORD}`,
  ]);
  return encryptedPrivateKey;
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
    OPENSSL_CONFIG_FILE_PATH,
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

interface GenerateDevKeysAndCertsInput {
  forTests: boolean;
  outputDir: string;
}

async function parseCommandLineArgs() {
  const argParser = yargs()
    .options({
      'for-tests': {
        description: 'Whether to generate keys and certs for tests',
        type: 'boolean',
        default: false,
      },
      'output-dir': {
        description: 'The directory to output generated keys and certs to',
        type: 'string',
        default: './certs/dev',
      },
    })
    .hide('help')
    .version(false)
    .example('$ ./scripts/generate-dev-keys-and-certs --help', '')
    .example('$ ./scripts/generate-dev-keys-and-certs', '')
    .example(
      '$ ./scripts/generate-dev-keys-and-certs \\\n' +
        '--for-tests --output-dir ./certs/test/set-1',
      ''
    )
    .strict();

  const helpMessage = await argParser.getHelp();
  argParser.fail((errorMessage: string) => {
    throw new Error(`${errorMessage}\n\n${helpMessage}`);
  });

  const args = argParser.parse(process.argv.slice(2)) as {
    forTests: boolean;
    help?: boolean;
    outputDir: string;
  };

  if (args.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  return {
    forTests: args.forTests,
    outputDir: args.outputDir,
  };
}

async function generateDevKeysAndCerts({
  forTests,
  outputDir,
}: GenerateDevKeysAndCertsInput): Promise<void> {
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
    const cardConfigs: Array<{ cardType: CardType; cardDetails: CardDetails }> =
      [
        {
          cardType: 'system-administrator',
          cardDetails: {
            user: {
              role: 'system_administrator',
              jurisdiction: DEV_JURISDICTION,
            },
          },
        },
        {
          cardType: 'election-manager',
          cardDetails: {
            user: {
              role: 'election_manager',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
          },
        },
        {
          cardType: 'poll-worker',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
            hasPin: false,
          },
        },
        {
          cardType: 'poll-worker-with-pin',
          cardDetails: {
            user: {
              role: 'poll_worker',
              jurisdiction: DEV_JURISDICTION,
              electionHash,
            },
            hasPin: true,
          },
        },
      ];
    for (const { cardType, cardDetails } of cardConfigs) {
      runCommand(['mkdir', '-p', `${outputDir}/${cardType}`]);
      const cardVxPrivateKeyPath = `${outputDir}/${cardType}/card-vx-private-key.pem`;
      const cardVxPublicKeyPath = `${outputDir}/${cardType}/card-vx-public-key.der`;
      const cardVxCertPath = `${outputDir}/${cardType}/card-vx-cert.der`;
      const cardVxAdminPrivateKeyPath = `${outputDir}/${cardType}/card-vx-admin-private-key.pem`;
      const cardVxAdminPublicKeyPath = `${outputDir}/${cardType}/card-vx-admin-public-key.der`;
      const cardVxAdminCertPath = `${outputDir}/${cardType}/card-vx-admin-cert.der`;

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
        certSubject: constructCardCertSubject(cardDetails),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
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
 * If run with --for-tests, the script will additionally:
 * - Save the VxAdmin cert authority cert in DER format
 *
 * And generate for each of a system administrator, election manager, poll worker, and poll worker
 * with a PIN:
 * - A first card key pair
 * - A second card key pair
 * - A card VotingWorks cert by signing the first key pair's public key with the VotingWorks cert
 *   authority cert
 * - A card VxAdmin cert by signing the second key pair's public key with the VxAdmin cert
 *   authority cert
 *
 * Run with --help for further guidance.
 */
export async function main(): Promise<void> {
  try {
    const generateDevKeysAndCertsInput = await parseCommandLineArgs();
    await generateDevKeysAndCerts(generateDevKeysAndCertsInput);
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  console.log('✅ Done!');
  process.exit(0);
}
