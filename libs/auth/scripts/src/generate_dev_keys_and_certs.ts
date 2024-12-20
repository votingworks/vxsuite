import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs/yargs';
import { extractErrorMessage } from '@votingworks/basics';
import {
  constructElectionKey,
  DEV_MACHINE_ID,
  ElectionDefinition,
  TEST_JURISDICTION,
} from '@votingworks/types';

import { readElection } from '@votingworks/fs';
import { ProgrammedCardDetails } from '../../src/card';
import {
  CardType,
  CERT_EXPIRY_IN_DAYS,
  constructCardCertSubject,
  constructCardCertSubjectWithoutJurisdictionAndCardType,
  constructMachineCertSubject,
  MachineType,
} from '../../src/certs';
import {
  certPemToDer,
  createCert,
  CreateCertInput,
  openssl,
  publicKeyPemToDer,
} from '../../src/cryptography';
import { DEV_JURISDICTION } from '../../src/jurisdictions';
import { runCommand } from '../../src/shell';
import { generatePrivateKey, generateSelfSignedCert } from './utils';

function extractPublicKeyFromDevPrivateKey(
  privateKeyPath: string
): Promise<Buffer> {
  return openssl(['ec', '-pubout', '-in', privateKeyPath]);
}

interface GenerateDevKeysAndCertsInput {
  forTests: boolean;
  outputDir: string;
  electionDefinition: ElectionDefinition;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<GenerateDevKeysAndCertsInput> {
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
        default: path.join(__dirname, '../../certs/dev'),
      },
      'election-definition': {
        description:
          'The path to an election definition to generate keys and certs for',
        type: 'string',
        default: path.join(
          __dirname,
          '../../../fixtures/data/electionFamousNames2021/electionGeneratedWithGridLayoutsEnglishOnly.json'
        ),
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

  const parsedArgs = argParser.parse(args) as {
    forTests: boolean;
    help?: boolean;
    outputDir: string;
    electionDefinition: string;
  };

  if (parsedArgs.help) {
    console.log(helpMessage);
    process.exit(0);
  }

  const electionDefinition = (
    await readElection(parsedArgs.electionDefinition)
  ).unsafeUnwrap();

  return {
    forTests: parsedArgs.forTests,
    outputDir: parsedArgs.outputDir,
    electionDefinition,
  };
}

async function generateDevKeysAndCerts({
  forTests,
  outputDir,
  electionDefinition,
}: GenerateDevKeysAndCertsInput): Promise<void> {
  const jurisdiction = forTests ? TEST_JURISDICTION : DEV_JURISDICTION;

  await runCommand(['mkdir', '-p', outputDir]);

  // Generate VotingWorks private key and cert authority cert
  const vxPrivateKeyPath = `${outputDir}/vx-private-key.pem`;
  const vxCertAuthorityCertPath = `${outputDir}/vx-cert-authority-cert.pem`;
  const vxPrivateKey = await generatePrivateKey();
  await fs.writeFile(vxPrivateKeyPath, vxPrivateKey);
  const vxCertAuthorityCert = await generateSelfSignedCert({
    privateKeyPath: vxPrivateKeyPath,
    commonName: 'VotingWorks Development',
    expiryDays: CERT_EXPIRY_IN_DAYS.DEV,
  });
  await fs.writeFile(vxCertAuthorityCertPath, vxCertAuthorityCert);

  // Generate VxAdmin private key and cert authority cert
  const vxAdminPrivateKeyPath = `${outputDir}/vx-admin-private-key.pem`;
  const vxAdminCertAuthorityCertPath = `${outputDir}/vx-admin-cert-authority-cert.pem`;
  const vxAdminPrivateKey = await generatePrivateKey();
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
    const machinePrivateKey = await generatePrivateKey();
    await fs.writeFile(machinePrivateKeyPath, machinePrivateKey);
    const machineCert = await createCert({
      certKeyInput: {
        type: 'private',
        key: { source: 'file', path: machinePrivateKeyPath },
      },
      certSubject: constructMachineCertSubject({
        machineType,
        machineId: DEV_MACHINE_ID,
      }),
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

    const { election } = electionDefinition;
    const electionKey = constructElectionKey(election);
    const cardConfigs: Array<{
      cardType: CardType;
      cardDetails: ProgrammedCardDetails;
    }> = [
      {
        cardType: 'vendor',
        cardDetails: {
          user: { role: 'vendor', jurisdiction },
        },
      },
      {
        cardType: 'system-administrator',
        cardDetails: {
          user: { role: 'system_administrator', jurisdiction },
        },
      },
      {
        cardType: 'election-manager',
        cardDetails: {
          user: { role: 'election_manager', jurisdiction, electionKey },
        },
      },
      {
        cardType: 'poll-worker',
        cardDetails: {
          user: { role: 'poll_worker', jurisdiction, electionKey },
          hasPin: false,
        },
      },
      {
        cardType: 'poll-worker-with-pin',
        cardDetails: {
          user: { role: 'poll_worker', jurisdiction, electionKey },
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
      const cardVxPrivateKey = await generatePrivateKey();
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

      // Generate card identity key pair and cert
      const cardIdentityPrivateKeyPath = `${outputDir}/${cardType}/card-identity-private-key.pem`;
      const cardIdentityPublicKeyPath = `${outputDir}/${cardType}/card-identity-public-key.der`;
      const cardIdentityCertPath = `${outputDir}/${cardType}/card-identity-cert.der`;
      const cardIdentityCertExpiredPath = `${outputDir}/${cardType}/card-identity-cert-expired.der`;
      const cardIdentityPrivateKey = await generatePrivateKey();
      await fs.writeFile(cardIdentityPrivateKeyPath, cardIdentityPrivateKey);
      const cardIdentityPublicKey = await extractPublicKeyFromDevPrivateKey(
        cardIdentityPrivateKeyPath
      );
      await fs.writeFile(
        cardIdentityPublicKeyPath,
        await publicKeyPemToDer(cardIdentityPublicKey)
      );
      const createCertInput: CreateCertInput = {
        certKeyInput: {
          type: 'public',
          key: {
            source: 'inline',
            content: cardIdentityPublicKey.toString('utf-8'),
          },
        },
        certSubject: constructCardCertSubject(cardDetails),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCertPath:
          cardType === 'vendor'
            ? vxCertAuthorityCertPath
            : vxAdminCertAuthorityCertPath,
        signingPrivateKey: {
          source: 'file',
          path:
            cardType === 'vendor' ? vxPrivateKeyPath : vxAdminPrivateKeyPath,
        },
      };
      const cardIdentityCert = await createCert(createCertInput);
      await fs.writeFile(
        cardIdentityCertPath,
        await certPemToDer(cardIdentityCert)
      );

      // Generate an expired version of the card identity cert
      const cardIdentityCertExpired = await createCert({
        ...createCertInput,
        expiryInDays: 0,
      });
      await fs.writeFile(
        cardIdentityCertExpiredPath,
        await certPemToDer(cardIdentityCertExpired)
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
 * And generate for each of a vendor user, system administrator, election manager, poll worker, and
 * poll worker with a PIN:
 * - A first card key pair
 * - A second card key pair
 * - A card VotingWorks cert, containing the first key pair's public key
 * - A card identity cert, containing the second key pair's public key
 *
 * Run with --help for further guidance.
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    await generateDevKeysAndCerts(await parseCommandLineArgs(args));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
