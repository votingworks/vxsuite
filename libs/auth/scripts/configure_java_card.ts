/* eslint-disable no-console */
import { Buffer } from 'buffer';
import { existsSync } from 'fs';
import { sleep } from '@votingworks/basics';
import { Byte } from '@votingworks/types';

import { CommandApdu, constructTlv } from '../src/apdu';
import {
  CARD_VX_ADMIN_CERT,
  CARD_VX_CERT,
  DEFAULT_PIN,
  GENERIC_STORAGE_SPACE,
  JavaCard,
  MAX_INVALID_PIN_ATTEMPTS,
  OPEN_FIPS_201_AID,
  PUK,
  VX_ADMIN_CERT_AUTHORITY_CERT,
} from '../src/java_card';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
} from '../src/piv';
import { errorContains, getEnvVar, runCommand } from './utils';

const APPLET_PATH = 'applets/OpenFIPS201-v1.10.2-with-vx-mods.cap';
const GLOBAL_PLATFORM_PATH = 'scripts/gp.jar';

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
  MAX_INVALID_PIN_ATTEMPTS_OVER_CONTACT_INTERFACE_TAG: 0x86,

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

const vxCertAuthorityCertPath = getEnvVar('VX_CERT_AUTHORITY_CERT_PATH');
const vxOpensslConfigPath = getEnvVar('VX_OPENSSL_CONFIG_PATH');
const vxPrivateKeyPassword = getEnvVar('VX_PRIVATE_KEY_PASSWORD');
const vxPrivateKeyPath = getEnvVar('VX_PRIVATE_KEY_PATH');

function sectionLog(symbol: string, message: string): void {
  console.log('-'.repeat(3 + message.length));
  console.log(`${symbol} ${message}`);
  console.log('-'.repeat(3 + message.length));
}

function globalPlatformCommand(command: string[]): string[] {
  return ['java', '-jar', GLOBAL_PLATFORM_PATH, ...command];
}

function checkForScriptDependencies(): void {
  if (!existsSync(GLOBAL_PLATFORM_PATH)) {
    throw new Error(
      'Missing script dependencies; install using `make install-script-dependencies`'
    );
  }
}

function installApplet(): void {
  sectionLog('🧹', 'Uninstalling applet if already installed...');
  try {
    runCommand(globalPlatformCommand(['--uninstall', APPLET_PATH]));
  } catch (error) {
    // Don't err if the applet was never installed to begin with
    if (!errorContains(error, 'is not present on card!')) {
      throw error;
    }
  }

  sectionLog('💿', 'Installing applet...');
  runCommand(globalPlatformCommand(['--install', APPLET_PATH]));
}

function configureKeySlotCommandApdu(
  keyId: Byte,
  accessMode: Byte
): CommandApdu {
  return new CommandApdu({
    cla: { secure: true },
    ins: PUT_DATA_ADMIN.INS,
    p1: PUT_DATA_ADMIN.P1,
    p2: PUT_DATA_ADMIN.P2,
    data: constructTlv(
      PUT_DATA_ADMIN.CREATE_KEY_TAG,
      Buffer.concat([
        constructTlv(PUT_DATA_ADMIN.ID_TAG, Buffer.from([keyId])),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACT_INTERFACE_TAG,
          Buffer.from([accessMode])
        ),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACTLESS_INTERFACE_TAG,
          Buffer.from([PUT_DATA_ADMIN.ACCESS_MODE_NEVER])
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_MECHANISM_TAG,
          Buffer.from([CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.ECC256])
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_ROLE_TAG,
          Buffer.from([PUT_DATA_ADMIN.KEY_ROLE_SIGN])
        ),
        constructTlv(
          PUT_DATA_ADMIN.KEY_ATTRIBUTE_TAG,
          Buffer.from([PUT_DATA_ADMIN.KEY_ATTRIBUTE_NONE])
        ),
      ])
    ),
  });
}

function configureDataObjectSlotCommandApdu(objectId: Buffer): CommandApdu {
  return new CommandApdu({
    cla: { secure: true },
    ins: PUT_DATA_ADMIN.INS,
    p1: PUT_DATA_ADMIN.P1,
    p2: PUT_DATA_ADMIN.P2,
    data: constructTlv(
      PUT_DATA_ADMIN.CREATE_OBJECT_TAG,
      Buffer.concat([
        constructTlv(PUT_DATA_ADMIN.ID_TAG, objectId),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACT_INTERFACE_TAG,
          Buffer.from([PUT_DATA_ADMIN.ACCESS_MODE_ALWAYS])
        ),
        constructTlv(
          PUT_DATA_ADMIN.ACCESS_MODE_OVER_CONTACTLESS_INTERFACE_TAG,
          Buffer.from([PUT_DATA_ADMIN.ACCESS_MODE_NEVER])
        ),
      ])
    ),
  });
}

function runAppletConfigurationCommands(): void {
  sectionLog('🔧', 'Running applet configuration commands...');

  const apdus = [
    // Set PIN
    new CommandApdu({
      cla: { secure: true },
      ins: CHANGE_REFERENCE_DATA_ADMIN.INS,
      p1: CHANGE_REFERENCE_DATA_ADMIN.P1,
      p2: CHANGE_REFERENCE_DATA_ADMIN.P2_PIN,
      data: construct8BytePinBuffer(DEFAULT_PIN),
    }),

    // Set PUK
    new CommandApdu({
      cla: { secure: true },
      ins: CHANGE_REFERENCE_DATA_ADMIN.INS,
      p1: CHANGE_REFERENCE_DATA_ADMIN.P1,
      p2: CHANGE_REFERENCE_DATA_ADMIN.P2_PUK,
      data: PUK,
    }),

    // Configure max invalid PIN attempts
    new CommandApdu({
      cla: { secure: true },
      ins: PUT_DATA_ADMIN.INS,
      p1: PUT_DATA_ADMIN.P1,
      p2: PUT_DATA_ADMIN.P2,
      data: constructTlv(
        PUT_DATA_ADMIN.UPDATE_CONFIG_TAG,
        constructTlv(
          PUT_DATA_ADMIN.PIN_POLICY_TAG,
          constructTlv(
            PUT_DATA_ADMIN.MAX_INVALID_PIN_ATTEMPTS_OVER_CONTACT_INTERFACE_TAG,
            Buffer.from([MAX_INVALID_PIN_ATTEMPTS])
          )
        )
      ),
    }),

    // Configure key slots
    configureKeySlotCommandApdu(
      CARD_VX_CERT.PRIVATE_KEY_ID,
      // This doesn't mean that the private key itself can be accessed, just that it can always be
      // used for signing operations, without a PIN
      PUT_DATA_ADMIN.ACCESS_MODE_ALWAYS
    ),
    configureKeySlotCommandApdu(
      CARD_VX_ADMIN_CERT.PRIVATE_KEY_ID,
      PUT_DATA_ADMIN.ACCESS_MODE_PIN_GATED
    ),

    // Configure data object slots
    configureDataObjectSlotCommandApdu(CARD_VX_CERT.OBJECT_ID),
    configureDataObjectSlotCommandApdu(CARD_VX_ADMIN_CERT.OBJECT_ID),
    configureDataObjectSlotCommandApdu(VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID),
    ...GENERIC_STORAGE_SPACE.OBJECT_IDS.map((objectId) =>
      configureDataObjectSlotCommandApdu(objectId)
    ),
  ];

  const apduStrings = apdus.map((apdu) => apdu.asHexString(':'));
  console.log(
    'Sending the following APDUs over a GlobalPlatform Secure Channel:'
  );
  for (const apduString of apduStrings) console.log(`> ${apduString}`);
  const output = runCommand(
    // -d --> Output command and response APDUs
    // -c <applet-id> + --mode enc + -s <apdu> --> Use a GlobalPlatform Secure Channel
    globalPlatformCommand([
      '-d',
      '-c',
      OPEN_FIPS_201_AID,
      '--mode',
      'enc',
      ...apduStrings.map((apduString) => ['-s', apduString]).flat(),
    ])
  );
  const apduLines = output
    .split('\n')
    .filter((line) => line.startsWith('A>>') || line.startsWith('A<<'));
  const successCount = apduLines.filter(
    (line) => line.startsWith('A<<') && line.endsWith('9000')
  ).length;
  // Applet selection and establishment of GlobalPlatform Secure Channel
  const baselineApduCount = 3;
  if (successCount !== baselineApduCount + apdus.length) {
    console.error(apduLines.join('\n'));
    throw new Error(
      'Not all applet configuration commands returned 90 00 success status word'
    );
  }
}

async function createAndStoreCardVxCert(): Promise<void> {
  sectionLog('🔏', 'Creating and storing card VotingWorks cert...');

  const card = new JavaCard({
    jurisdiction: '',
    vxCertAuthorityCertPath,
  });

  // Wait for ready card status
  let remainingWaitTimeSeconds = 3;
  while (
    (await card.getCardStatus()).status !== 'ready' &&
    remainingWaitTimeSeconds > 0
  ) {
    await sleep(1000);
    remainingWaitTimeSeconds -= 1;
  }

  await card.createAndStoreCardVxCert({
    vxOpensslConfigPath,
    vxPrivateKeyPassword,
    vxPrivateKeyPath,
  });
}

/**
 * An initial Java Card configuration script to be run at the Bakery
 */
export async function main(): Promise<void> {
  try {
    checkForScriptDependencies();
    installApplet();
    runAppletConfigurationCommands();
    await createAndStoreCardVxCert();
  } catch (error) {
    console.error(error instanceof Error ? `❌ ${error.message}` : error);
    process.exit(1);
  }
  sectionLog('✅', 'Done!');
  process.exit(0);
}
