import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import yargs from 'yargs/yargs';
import { assertDefined, extractErrorMessage } from '@votingworks/basics';
import { readElection } from '@votingworks/fs';
import {
  constructElectionKey,
  DEV_MACHINE_ID,
  ElectionDefinition,
  TEST_JURISDICTION,
} from '@votingworks/types';

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

interface CommandLineArgs {
  forTests: boolean;
  outputDir: string;
  electionDefinition: ElectionDefinition;
}

async function parseCommandLineArgs(
  args: readonly string[]
): Promise<CommandLineArgs> {
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
      '$ generate-dev-keys-and-certs --for-tests --output-dir path/to/output-dir',
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
}: CommandLineArgs): Promise<void> {
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

  // Generate card-programming machine private keys and cert authority certs
  const cardProgrammingMachineTypes: MachineType[] = ['admin', 'poll-book'];
  const cardProgrammingMachineKeysAndCerts: Map<
    MachineType,
    { machineCertAuthorityCertPath: string; machinePrivateKeyPath: string }
  > = new Map();
  for (const machineType of cardProgrammingMachineTypes) {
    const machinePrivateKeyPath = `${outputDir}/vx-${machineType}-private-key.pem`;
    const machineCertAuthorityCertPath = `${outputDir}/vx-${machineType}-cert-authority-cert.pem`;
    const machinePrivateKey = await generatePrivateKey();
    await fs.writeFile(machinePrivateKeyPath, machinePrivateKey);
    const machineCertAuthorityCert = await createCert({
      certKeyInput: {
        type: 'private',
        key: { source: 'file', path: machinePrivateKeyPath },
      },
      certSubject: constructMachineCertSubject({
        machineType,
        machineId: DEV_MACHINE_ID,
        jurisdiction,
      }),
      certType: 'cert_authority_cert',
      expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
      signingCertAuthorityCertPath: vxCertAuthorityCertPath,
      signingPrivateKey: { source: 'file', path: vxPrivateKeyPath },
    });
    await fs.writeFile(machineCertAuthorityCertPath, machineCertAuthorityCert);

    if (forTests) {
      // Save machine cert authority cert in DER format
      await fs.writeFile(
        machineCertAuthorityCertPath.replace('.pem', '.der'),
        await certPemToDer(machineCertAuthorityCert)
      );
    }

    cardProgrammingMachineKeysAndCerts.set(machineType, {
      machineCertAuthorityCertPath,
      machinePrivateKeyPath,
    });
  }

  // Generate non-card-programming machine private keys and certs
  const nonCardProgrammingMachineTypes: MachineType[] = [
    'central-scan',
    'mark',
    'mark-scan',
    'scan',
    'print',
  ];
  for (const machineType of nonCardProgrammingMachineTypes) {
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
    const { election } = electionDefinition;
    const electionKey = constructElectionKey(election);
    const cardConfigs: Array<{
      cardType: CardType;
      cardDetails: ProgrammedCardDetails;
    }> = [
      {
        cardType: 'vendor',
        cardDetails: {
          user: {
            role: 'vendor',
            jurisdiction,
          },
        },
      },
      {
        cardType: 'system-administrator',
        cardDetails: {
          user: {
            role: 'system_administrator',
            jurisdiction,
            programmingMachineType: 'admin',
          },
        },
      },
      {
        cardType: 'election-manager',
        cardDetails: {
          user: {
            role: 'election_manager',
            jurisdiction,
            programmingMachineType: 'admin',
            electionKey,
          },
        },
      },
      {
        cardType: 'poll-worker',
        cardDetails: {
          user: {
            role: 'poll_worker',
            jurisdiction,
            programmingMachineType: 'admin',
            electionKey,
          },
          hasPin: false,
        },
      },
      {
        cardType: 'poll-worker-with-pin',
        cardDetails: {
          user: {
            role: 'poll_worker',
            jurisdiction,
            programmingMachineType: 'admin',
            electionKey,
          },
          hasPin: true,
        },
      },
      {
        cardType: 'system-administrator',
        cardDetails: {
          user: {
            role: 'system_administrator',
            jurisdiction,
            programmingMachineType: 'poll-book',
          },
        },
      },
      {
        cardType: 'election-manager',
        cardDetails: {
          user: {
            role: 'election_manager',
            jurisdiction,
            programmingMachineType: 'poll-book',
            electionKey,
          },
        },
      },
      {
        cardType: 'poll-worker',
        cardDetails: {
          user: {
            role: 'poll_worker',
            jurisdiction,
            programmingMachineType: 'poll-book',
            electionKey,
          },
          hasPin: false,
        },
      },
      {
        cardType: 'poll-worker-with-pin',
        cardDetails: {
          user: {
            role: 'poll_worker',
            jurisdiction,
            programmingMachineType: 'poll-book',
            electionKey,
          },
          hasPin: true,
        },
      },
    ];
    for (const { cardType, cardDetails } of cardConfigs) {
      const cardDirectoryPathComponents: string[] = [outputDir, cardType];
      if (cardDetails.user.role !== 'vendor') {
        cardDirectoryPathComponents.push(
          // VxAdmin-programmed vs. VxPollBook-programmed
          `vx-${cardDetails.user.programmingMachineType}-programmed`
        );
      }
      const cardDirectoryPath = path.join(...cardDirectoryPathComponents);
      await runCommand(['mkdir', '-p', cardDirectoryPath]);

      // Generate card VotingWorks key pair and cert
      const cardVxPrivateKeyPath = `${cardDirectoryPath}/card-vx-private-key.pem`;
      const cardVxPublicKeyPath = `${cardDirectoryPath}/card-vx-public-key.der`;
      const cardVxCertPath = `${cardDirectoryPath}/card-vx-cert.der`;
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
      const cardIdentityPrivateKeyPath = `${cardDirectoryPath}/card-identity-private-key.pem`;
      const cardIdentityPublicKeyPath = `${cardDirectoryPath}/card-identity-public-key.der`;
      const cardIdentityCertPath = `${cardDirectoryPath}/card-identity-cert.der`;
      const cardIdentityCertExpiredPath = `${cardDirectoryPath}/card-identity-cert-expired.der`;
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
          cardDetails.user.role === 'vendor'
            ? vxCertAuthorityCertPath
            : assertDefined(
                cardProgrammingMachineKeysAndCerts.get(
                  cardDetails.user.programmingMachineType
                )
              ).machineCertAuthorityCertPath,
        signingPrivateKey: {
          source: 'file',
          path:
            cardDetails.user.role === 'vendor'
              ? vxPrivateKeyPath
              : assertDefined(
                  cardProgrammingMachineKeysAndCerts.get(
                    cardDetails.user.programmingMachineType
                  )
                ).machinePrivateKeyPath,
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
 * - VxPollBook private key
 * - VxPollBook cert authority cert
 * - VxCentralScan private key
 * - VxCentralScan cert
 * - VxMark private key
 * - VxMark cert
 * - VxMarkScan private key
 * - VxMarkScan cert
 * - VxScan private key
 * - VxScan cert
 * - VxPrint private key
 * - VxPrint cert
 *
 * If run with --for-tests, the script will additionally:
 * - Save the VxAdmin cert authority cert in DER format
 *
 * And generate for each of a:
 * - Vendor user
 * - VxAdmin-programmed system administrator
 * - VxAdmin-programmed election manager
 * - VxAdmin-programmed poll worker
 * - VxAdmin-programmed poll worker with a PIN
 * - VxPollBook-programmed system administrator
 * - VxPollBook-programmed election manager
 * - VxPollBook-programmed poll worker
 * - VxPollBook-programmed poll worker with a PIN
 * The following:
 * - A first card key pair
 * - A second card key pair
 * - A card VotingWorks cert, containing the first key pair's public key
 * - A card identity cert, containing the second key pair's public key
 *
 * Run with --help for further guidance.
 */
export async function main(args: readonly string[]): Promise<void> {
  try {
    const commandLineArgs = await parseCommandLineArgs(args);
    await generateDevKeysAndCerts(commandLineArgs);
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
