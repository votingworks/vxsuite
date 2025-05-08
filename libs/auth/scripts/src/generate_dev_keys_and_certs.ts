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
  CertPemFile,
  cryptographicBufferToFile,
  pemBuffer,
  PrivateKeyPemFile,
  PublicKeyPemBuffer,
} from '../../src/cryptographic_material';
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

async function extractPublicKeyFromPrivateKey(
  privateKey: PrivateKeyPemFile
): Promise<PublicKeyPemBuffer> {
  return pemBuffer(
    'public_key',
    await openssl(['ec', '-pubout', '-in', privateKey.path])
  );
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
  const vxPrivateKey = await cryptographicBufferToFile(
    await generatePrivateKey(),
    `${outputDir}/vx-private-key.pem`
  );
  const vxCertAuthorityCert = await cryptographicBufferToFile(
    await generateSelfSignedCert({
      privateKey: vxPrivateKey,
      commonName: 'VotingWorks Development',
      expiryDays: CERT_EXPIRY_IN_DAYS.DEV,
    }),
    `${outputDir}/vx-cert-authority-cert.pem`
  );

  // Generate card-programming machine private keys and cert authority certs
  const cardProgrammingMachineTypes: MachineType[] = ['admin', 'poll-book'];
  const cardProgrammingMachineKeysAndCerts: Map<
    MachineType,
    {
      machineCertAuthorityCert: CertPemFile;
      machinePrivateKey: PrivateKeyPemFile;
    }
  > = new Map();
  for (const machineType of cardProgrammingMachineTypes) {
    const machinePrivateKey = await cryptographicBufferToFile(
      await generatePrivateKey(),
      `${outputDir}/vx-${machineType}-private-key.pem`
    );
    const machineCertAuthorityCert = await cryptographicBufferToFile(
      await createCert({
        certKeyInput: machinePrivateKey,
        certSubject: constructMachineCertSubject({
          machineType,
          machineId: DEV_MACHINE_ID,
          jurisdiction,
        }),
        certType: 'cert_authority_cert',
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCert: vxCertAuthorityCert,
        signingPrivateKey: vxPrivateKey,
      }),
      `${outputDir}/vx-${machineType}-cert-authority-cert.pem`
    );

    if (forTests) {
      // Save machine cert authority cert in DER format
      await cryptographicBufferToFile(
        await certPemToDer(machineCertAuthorityCert),
        `${outputDir}/vx-${machineType}-cert-authority-cert.der`
      );
    }

    cardProgrammingMachineKeysAndCerts.set(machineType, {
      machineCertAuthorityCert,
      machinePrivateKey,
    });
  }

  // Generate non-card-programming machine private keys and certs
  const nonCardProgrammingMachineTypes: MachineType[] = [
    'central-scan',
    'mark',
    'mark-scan',
    'scan',
  ];
  for (const machineType of nonCardProgrammingMachineTypes) {
    const machinePrivateKey = await cryptographicBufferToFile(
      await generatePrivateKey(),
      `${outputDir}/vx-${machineType}-private-key.pem`
    );
    await cryptographicBufferToFile(
      await createCert({
        certKeyInput: machinePrivateKey,
        certSubject: constructMachineCertSubject({
          machineType,
          machineId: DEV_MACHINE_ID,
        }),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCert: vxCertAuthorityCert,
        signingPrivateKey: vxPrivateKey,
      }),
      `${outputDir}/vx-${machineType}-cert.pem`
    );
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
      const cardVxPrivateKey = await cryptographicBufferToFile(
        await generatePrivateKey(),
        `${cardDirectoryPath}/card-vx-private-key.pem`
      );
      const cardVxPublicKey =
        await extractPublicKeyFromPrivateKey(cardVxPrivateKey);
      await cryptographicBufferToFile(
        await publicKeyPemToDer(cardVxPublicKey),
        `${cardDirectoryPath}/card-vx-public-key.der`
      );
      const cardVxCert = await createCert({
        certKeyInput: cardVxPublicKey,
        certSubject: constructCardCertSubjectWithoutJurisdictionAndCardType(),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCert: vxCertAuthorityCert,
        signingPrivateKey: vxPrivateKey,
      });
      await cryptographicBufferToFile(
        await certPemToDer(cardVxCert),
        `${cardDirectoryPath}/card-vx-cert.der`
      );

      // Generate card identity key pair and cert
      const cardIdentityPrivateKey = await cryptographicBufferToFile(
        await generatePrivateKey(),
        `${cardDirectoryPath}/card-identity-private-key.pem`
      );
      const cardIdentityPublicKey = await extractPublicKeyFromPrivateKey(
        cardIdentityPrivateKey
      );
      await cryptographicBufferToFile(
        await publicKeyPemToDer(cardIdentityPublicKey),
        `${cardDirectoryPath}/card-identity-public-key.der`
      );
      const createCertInput: CreateCertInput = {
        certKeyInput: cardIdentityPublicKey,
        certSubject: constructCardCertSubject(cardDetails),
        expiryInDays: CERT_EXPIRY_IN_DAYS.DEV,
        signingCertAuthorityCert:
          cardDetails.user.role === 'vendor'
            ? vxCertAuthorityCert
            : assertDefined(
                cardProgrammingMachineKeysAndCerts.get(
                  cardDetails.user.programmingMachineType
                )
              ).machineCertAuthorityCert,
        signingPrivateKey:
          cardDetails.user.role === 'vendor'
            ? vxPrivateKey
            : assertDefined(
                cardProgrammingMachineKeysAndCerts.get(
                  cardDetails.user.programmingMachineType
                )
              ).machinePrivateKey,
      };
      const cardIdentityCert = await createCert(createCertInput);
      await cryptographicBufferToFile(
        await certPemToDer(cardIdentityCert),
        `${cardDirectoryPath}/card-identity-cert.der`
      );

      // Generate an expired version of the card identity cert
      const cardIdentityCertExpired = await createCert({
        ...createCertInput,
        expiryInDays: 0,
      });
      await cryptographicBufferToFile(
        await certPemToDer(cardIdentityCertExpired),
        `${cardDirectoryPath}/card-identity-cert-expired.der`
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
 * - VxScan private key
 * - VxScan cert
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
