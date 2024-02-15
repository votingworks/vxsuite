import { Buffer } from 'buffer';
import fs from 'fs/promises';
import path from 'path';
import yargs from 'yargs/yargs';
import { extractErrorMessage } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { TEST_JURISDICTION } from '@votingworks/types';

import { CardDetails } from '../src/card';
import {
  CardType,
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  constructMachineCertSubject,
  MachineType,
  STANDARD_CERT_FIELDS,
} from '../src/certs';
import {
  certPemToDer,
  createCert,
  openssl,
  OPENSSL_CONFIG_FILE_PATH,
  publicKeyPemToDer,
} from '../src/cryptography';
import { DEV_JURISDICTION } from '../src/jurisdictions';
import { runCommand } from '../src/shell';

async function generateDevPrivateKey(): Promise<Buffer> {
  return await openssl(['ecparam', '-genkey', '-name', 'prime256v1', '-noout']);
}

async function extractPublicKeyFromDevPrivateKey(
  privateKeyPath: string
): Promise<Buffer> {
  return await openssl(['ec', '-pubout', '-in', privateKeyPath]);
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
        default: path.join(__dirname, '../certs/dev'),
      },
    })
    .hide('help')
    .version(false)
    .example('$ generate-dev-keys-and-certs --help', '')
    .example('$ generate-dev-keys-and-certs', '')
    .example(
      '$ generate-dev-keys-and-certs \\\n' +
        '--for-tests --output-dir path/to/output-dir',
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
  const jurisdiction = forTests ? TEST_JURISDICTION : DEV_JURISDICTION;

  await runCommand(['mkdir', '-p', outputDir]);

  // Generate VotingWorks private key and cert authority cert
  const vxPrivateKeyPath = `${outputDir}/vx-private-key.pem`;
  const vxCertAuthorityCertPath = `${outputDir}/vx-cert-authority-cert.pem`;
  const vxPrivateKey = await generateDevPrivateKey();
  await fs.writeFile(vxPrivateKeyPath, vxPrivateKey);
  const vxCertAuthorityCert =
    await generateDevVxCertAuthorityCert(vxPrivateKeyPath);
  await fs.writeFile(vxCertAuthorityCertPath, vxCertAuthorityCert);

  // Generate VxAdmin private key and cert authority cert
  const vxAdminPrivateKeyPath = `${outputDir}/vx-admin-private-key.pem`;
  const vxAdminCertAuthorityCertPath = `${outputDir}/vx-admin-cert-authority-cert.pem`;
  const vxAdminPrivateKey = await generateDevPrivateKey();
  await fs.writeFile(vxAdminPrivateKeyPath, vxAdminPrivateKey);
  const vxAdminCertAuthorityCert = await createCert({
    certKeyInput: {
      type: 'private',
      key: { source: 'file', path: vxAdminPrivateKeyPath },
    },
    certSubject: constructMachineCertSubject('admin', jurisdiction),
    certType: 'cert_authority_cert',
    expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
    signingCertAuthorityCertPath: vxCertAuthorityCertPath,
    signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
  });
  await fs.writeFile(vxAdminCertAuthorityCertPath, vxAdminCertAuthorityCert);

  // Generate non-VxAdmin machine private keys and certs
  const nonVxAdminMachineTypes: MachineType[] = [
    'central-scan',
    'mark',
    'mark-scan',
    'scan',
  ];
  for (const machineType of nonVxAdminMachineTypes) {
    const machinePrivateKeyPath = `${outputDir}/vx-${machineType}-private-key.pem`;
    const machineCertPath = `${outputDir}/vx-${machineType}-cert.pem`;
    const machinePrivateKey = await generateDevPrivateKey();
    await fs.writeFile(machinePrivateKeyPath, machinePrivateKey);
    const machineCert = await createCert({
      certKeyInput: {
        type: 'private',
        key: { source: 'file', path: machinePrivateKeyPath },
      },
      certSubject: constructMachineCertSubject(machineType),
      expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
      signingCertAuthorityCertPath: vxCertAuthorityCertPath,
      signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
    });
    await fs.writeFile(machineCertPath, machineCert);
  }

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
            user: { role: 'system_administrator', jurisdiction },
          },
        },
        {
          cardType: 'election-manager',
          cardDetails: {
            user: { role: 'election_manager', jurisdiction, electionHash },
          },
        },
        {
          cardType: 'poll-worker',
          cardDetails: {
            user: { role: 'poll_worker', jurisdiction, electionHash },
            hasPin: false,
          },
        },
        {
          cardType: 'poll-worker-with-pin',
          cardDetails: {
            user: { role: 'poll_worker', jurisdiction, electionHash },
            hasPin: true,
          },
        },
      ];
    for (const { cardType, cardDetails } of cardConfigs) {
      await runCommand(['mkdir', '-p', `${outputDir}/${cardType}`]);

      // Generate card VotingWorks key pair and cert
      const cardVxPrivateKeyPath = `${outputDir}/${cardType}/card-vx-private-key.pem`;
      const cardVxPublicKeyPath = `${outputDir}/${cardType}/card-vx-public-key.der`;
      const cardVxCertPath = `${outputDir}/${cardType}/card-vx-cert.der`;
      const cardVxPrivateKey = await generateDevPrivateKey();
      await fs.writeFile(cardVxPrivateKeyPath, cardVxPrivateKey);
      const cardVxPublicKey =
        await extractPublicKeyFromDevPrivateKey(cardVxPrivateKeyPath);
      await fs.writeFile(
        cardVxPublicKeyPath,
        await publicKeyPemToDer(cardVxPublicKey)
      );
      const cardVxCert = await createCert({
        certKeyInput: {
          type: 'public',
          key: {
            source: 'inline',
            content: cardVxPublicKey.toString('utf-8'),
          },
        },
        certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCertPath: vxCertAuthorityCertPath,
        signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
      });
      await fs.writeFile(cardVxCertPath, await certPemToDer(cardVxCert));

      // Generate card VxAdmin key pair and cert
      const cardVxAdminPrivateKeyPath = `${outputDir}/${cardType}/card-vx-admin-private-key.pem`;
      const cardVxAdminPublicKeyPath = `${outputDir}/${cardType}/card-vx-admin-public-key.der`;
      const cardVxAdminCertPath = `${outputDir}/${cardType}/card-vx-admin-cert.der`;
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
        certKeyInput: {
          type: 'public',
          key: {
            source: 'inline',
            content: cardVxAdminPublicKey.toString('utf-8'),
          },
        },
        certSubject: constructCardCertSubject(cardDetails),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCertPath: vxAdminCertAuthorityCertPath,
        signingPrivateKey: { source: 'file', path: vxAdminPrivateKeyPath },
      });
      await fs.writeFile(
        cardVxAdminCertPath,
        await certPemToDer(cardVxAdminCert)
      );
    }
  }

  console.log('✅ Done!');
}

/**
 * A script for generating a dev:
 * - VotingWorks private key
 * - VotingWorks cert authority cert
 * - VxAdmin private key
 * - VxAdmin cert authority cert
 * - VxCentralScan private key
 * - VxCentralScan cert
 * - VxMark private key
 * - VxMark cert
 * - VxScan private key
 * - VxScan cert
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
    await generateDevKeysAndCerts(await parseCommandLineArgs());
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
