import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { extractErrorMessage, lines } from '@votingworks/basics';
import { Byte } from '@votingworks/types';

import { CommandApdu, constructTlv } from '../../../src/apdu';
import { getRequiredEnvVar } from '../../../src/env_vars';
import {
  MAX_NUM_INCORRECT_PIN_ATTEMPTS,
  OPEN_FIPS_201_AID,
  PUK,
} from '../../../src/java_card';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
} from '../../../src/piv';
import { runCommand } from '../../../src/shell';
import { waitForReadyCardStatus } from '../../src/utils';

import { CARD_DOD_CERT, CommonAccessCard, DEFAULT_PIN } from '../../../src/cac';

const APPLET_PATH = path.join(
  __dirname,
  '../../../applets/OpenFIPS201-v1.10.2-with-vx-mods.cap'
);
const GLOBAL_PLATFORM_JAR_FILE_PATH = path.join(__dirname, '../../gp.jar');

/**
 * CHANGE REFERENCE DATA ADMIN is an OpenFIPS201-specific extension of the PIV-standard CHANGE
 * REFERENCE DATA command. It allows setting PINs and PUKs without the current value. APDUs must be
 * sent over a GlobalPlatform Secure Channel.
 */
const CHANGE_REFERENCE_DATA_ADMIN = {
  INS: 0x24,
  P1: 0xff,
  P2_PIN: 0x80,
  P2_PUK: 0x81,
} as const;

/**
 * PUT DATA ADMIN is an OpenFIPS201-specific extension of the PIV-standard PUT DATA command, meant
 * for initial card configuration. APDUs must be sent over a GlobalPlatform Secure Channel.
 */
const PUT_DATA_ADMIN = {
  INS: 0xdb,
  P1: 0x3f,
  P2: 0x00,

  UPDATE_CONFIG_TAG: 0x68,
  PIN_POLICY_TAG: 0xa0,
  MAX_INCORRECT_PIN_ATTEMPTS_OVER_CONTACT_INTERFACE_TAG: 0x86,

  CREATE_KEY_TAG: 0x66,
  CREATE_OBJECT_TAG: 0x64,
  ID_TAG: 0x8b,
  ACCESS_MODE_OVER_CONTACT_INTERFACE_TAG: 0x8c,
  ACCESS_MODE_OVER_CONTACTLESS_INTERFACE_TAG: 0x8d,
  ACCESS_MODE_NEVER: 0x00,
  ACCESS_MODE_PIN_GATED: 0x12,
  ACCESS_MODE_ALWAYS: 0x7f,
  KEY_MECHANISM_TAG: 0x8e,
  KEY_ROLE_TAG: 0x8f,
  KEY_ROLE_SIGN: 0x04,
  KEY_ATTRIBUTE_TAG: 0x90,
  KEY_ATTRIBUTE_NONE: 0x00,
} as const;

const vxCertAuthorityCertPath = getRequiredEnvVar(
  'VX_CERT_AUTHORITY_CERT_PATH'
);
const vxPrivateKeyPath = getRequiredEnvVar('VX_PRIVATE_KEY_PATH');

function sectionLog(symbol: string, message: string): void {
  console.log('-'.repeat(3 + message.length));
  console.log(`${symbol} ${message}`);
  console.log('-'.repeat(3 + message.length));
}

function globalPlatformCommand(command: string[]): string[] {
  return ['java', '-jar', GLOBAL_PLATFORM_JAR_FILE_PATH, ...command];
}

function checkForScriptDependencies(): void {
  if (!existsSync(GLOBAL_PLATFORM_JAR_FILE_PATH)) {
    throw new Error(
      'Missing script dependencies; install using `make install-script-dependencies` in libs/auth'
    );
  }
}

async function installApplet(): Promise<void> {
  sectionLog('🧹', 'Uninstalling applet if already installed...');
  try {
    await runCommand(globalPlatformCommand(['--uninstall', APPLET_PATH]));
  } catch (error) {
    // Don't err if the applet was never installed to begin with
    if (!extractErrorMessage(error).includes('is not present on card!')) {
      throw error;
    }
  }

  sectionLog('💿', 'Installing applet...');
  await runCommand(globalPlatformCommand(['--install', APPLET_PATH]));
}

function configureKeySlotCommandApdu(
  keyId: Byte,
  accessMode: Byte
): CommandApdu {
  return new CommandApdu({
    cla: { secureMessaging: true },
    ins: PUT_DATA_ADMIN.INS,
    p1: PUT_DATA_ADMIN.P1,
    p2: PUT_DATA_ADMIN.P2,
    data: constructTlv(
      PUT_DATA_ADMIN.CREATE_KEY_TAG,
      Buffer.concat([
        constructTlv(PUT_DATA_ADMIN.ID_TAG, Buffer.of(keyId)),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACT_INTERFACE_TAG,
          Buffer.of(accessMode)
        ),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACTLESS_INTERFACE_TAG,
          Buffer.of(PUT_DATA_ADMIN.ACCESS_MODE_NEVER)
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_MECHANISM_TAG,
          Buffer.of(CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.RSA2048)
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_ROLE_TAG,
          Buffer.of(PUT_DATA_ADMIN.KEY_ROLE_SIGN)
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_ATTRIBUTE_TAG,
          Buffer.of(PUT_DATA_ADMIN.KEY_ATTRIBUTE_NONE)
        ),
      ])
    ),
  });
}

function configureDataObjectSlotCommandApdu(objectId: Buffer): CommandApdu {
  return new CommandApdu({
    cla: { secureMessaging: true },
    ins: PUT_DATA_ADMIN.INS,
    p1: PUT_DATA_ADMIN.P1,
    p2: PUT_DATA_ADMIN.P2,
    data: constructTlv(
      PUT_DATA_ADMIN.CREATE_OBJECT_TAG,
      Buffer.concat([
        constructTlv(PUT_DATA_ADMIN.ID_TAG, objectId),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACT_INTERFACE_TAG,
          Buffer.of(PUT_DATA_ADMIN.ACCESS_MODE_ALWAYS)
        ),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACTLESS_INTERFACE_TAG,
          Buffer.of(PUT_DATA_ADMIN.ACCESS_MODE_NEVER)
        ),
      ])
    ),
  });
}

async function runAppletConfigurationCommands(): Promise<void> {
  const cardPin = process.env['CARD_PIN'] || DEFAULT_PIN;
  sectionLog(
    '🔧',
    `Running applet configuration commands, with PIN ${cardPin}...`
  );

  const apdus = [
    // Set PIN
    new CommandApdu({
      cla: { secureMessaging: true },
      ins: CHANGE_REFERENCE_DATA_ADMIN.INS,
      p1: CHANGE_REFERENCE_DATA_ADMIN.P1,
      p2: CHANGE_REFERENCE_DATA_ADMIN.P2_PIN,
      data: construct8BytePinBuffer(cardPin),
    }),

    // Set PUK
    new CommandApdu({
      cla: { secureMessaging: true },
      ins: CHANGE_REFERENCE_DATA_ADMIN.INS,
      p1: CHANGE_REFERENCE_DATA_ADMIN.P1,
      p2: CHANGE_REFERENCE_DATA_ADMIN.P2_PUK,
      data: PUK,
    }),

    // Configure max incorrect PIN attempts
    new CommandApdu({
      cla: { secureMessaging: true },
      ins: PUT_DATA_ADMIN.INS,
      p1: PUT_DATA_ADMIN.P1,
      p2: PUT_DATA_ADMIN.P2,
      data: constructTlv(
        PUT_DATA_ADMIN.UPDATE_CONFIG_TAG,
        constructTlv(
          PUT_DATA_ADMIN.PIN_POLICY_TAG,
          constructTlv(
            PUT_DATA_ADMIN.MAX_INCORRECT_PIN_ATTEMPTS_OVER_CONTACT_INTERFACE_TAG,
            Buffer.of(MAX_NUM_INCORRECT_PIN_ATTEMPTS)
          )
        )
      ),
    }),

    // Configure key slots
    configureKeySlotCommandApdu(
      CARD_DOD_CERT.PRIVATE_KEY_ID,
      // This doesn't mean that the private key itself can be accessed, just that it can always be
      // used for signing operations, without a PIN
      PUT_DATA_ADMIN.ACCESS_MODE_ALWAYS
    ),

    // Configure data object slots
    configureDataObjectSlotCommandApdu(CARD_DOD_CERT.OBJECT_ID), // configureDataObjectSlotCommandApdu(CARD_VX_CERT.OBJECT_ID),
  ];

  const apduStrings = apdus.map((apdu) => apdu.asHexString(':'));
  console.log(
    'Sending the following APDUs over a GlobalPlatform Secure Channel:'
  );
  for (const apduString of apduStrings) {
    console.log(`> ${apduString}`);
  }
  const output = await runCommand(
    // -d --> Output command and response APDUs
    // -c <applet-id> + --mode enc + -s <apdu> --> Use a GlobalPlatform Secure Channel
    globalPlatformCommand([
      '-d',
      '-c',
      OPEN_FIPS_201_AID,
      '--mode',
      'enc',
      ...apduStrings.flatMap((apduString) => ['-s', apduString]),
    ])
  );
  const successCount = lines(output.toString('utf-8'))
    .filter((line) => line.startsWith('A<<') && line.endsWith('9000'))
    .count();
  // Applet selection and establishment of GlobalPlatform Secure Channel
  const baselineApduCount = 3;
  if (successCount !== baselineApduCount + apdus.length) {
    console.error(output.toString('utf-8'));
    throw new Error(
      'Not all applet configuration commands returned 90 00 success status word'
    );
  }
}

async function createAndStoreCardVxCert(commonName: string): Promise<void> {
  sectionLog(
    '🔏',
    `Creating and storing simulated CAC cert for ${commonName} ...`
  );
  const card = new CommonAccessCard({ certPath: vxCertAuthorityCertPath });
  await waitForReadyCardStatus(card);
  await card.createAndStoreCert(
    {
      source: 'file',
      path: vxPrivateKeyPath,
    },
    commonName
  );
}

/**
 * Create a mock Common Access Card for use with RAVE.
 */
export async function main(): Promise<void> {
  try {
    const commonName = getRequiredEnvVar('CERT_COMMON_NAME');
    checkForScriptDependencies();
    await installApplet();
    await runAppletConfigurationCommands();
    await createAndStoreCardVxCert(commonName);
    sectionLog('✅', 'Done!');
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
