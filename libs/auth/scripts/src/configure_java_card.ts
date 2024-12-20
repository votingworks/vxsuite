import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { extractErrorMessage, lines } from '@votingworks/basics';
import { Byte } from '@votingworks/types';

import { CommandApdu, constructTlv } from '../../src/apdu';
import {
  constructJavaCardConfigForVxProgramming,
  JavaCardConfig,
} from '../../src/config';
import {
  CARD_IDENTITY_CERT,
  CARD_VX_CERT,
  DEFAULT_PIN,
  GENERIC_STORAGE_SPACE,
  JavaCard,
  MAX_NUM_INCORRECT_PIN_ATTEMPTS,
  OPEN_FIPS_201_AID,
  PUK,
  VX_ADMIN_CERT_AUTHORITY_CERT,
} from '../../src/java_card';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
} from '../../src/piv';
import { runCommand } from '../../src/shell';
import { waitForReadyCardStatus } from './utils';

const APPLET_PATH = path.join(
  __dirname,
  '../../applets/OpenFIPS201-v1.10.2-with-vx-mods.cap'
);
const GLOBAL_PLATFORM_JAR_FILE_PATH = path.join(__dirname, '../gp.jar');

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

interface ScriptEnv {
  javaCardConfig: JavaCardConfig;
}

function readScriptEnvVars(): ScriptEnv {
  return {
    javaCardConfig: constructJavaCardConfigForVxProgramming(), // Uses env vars
  };
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
          Buffer.of(CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER.ECC256)
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
  sectionLog('🔧', 'Running applet configuration commands...');

  const apdus = [
    // Set PIN
    new CommandApdu({
      cla: { secureMessaging: true },
      ins: CHANGE_REFERENCE_DATA_ADMIN.INS,
      p1: CHANGE_REFERENCE_DATA_ADMIN.P1,
      p2: CHANGE_REFERENCE_DATA_ADMIN.P2_PIN,
      data: construct8BytePinBuffer(DEFAULT_PIN),
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
      CARD_VX_CERT.PRIVATE_KEY_ID,
      // This doesn't mean that the private key itself can be accessed, just that it can always be
      // used for signing operations, without a PIN
      PUT_DATA_ADMIN.ACCESS_MODE_ALWAYS
    ),
    configureKeySlotCommandApdu(
      CARD_IDENTITY_CERT.PRIVATE_KEY_ID,
      PUT_DATA_ADMIN.ACCESS_MODE_PIN_GATED
    ),

    // Configure data object slots
    configureDataObjectSlotCommandApdu(CARD_VX_CERT.OBJECT_ID),
    configureDataObjectSlotCommandApdu(CARD_IDENTITY_CERT.OBJECT_ID),
    configureDataObjectSlotCommandApdu(VX_ADMIN_CERT_AUTHORITY_CERT.OBJECT_ID),
    ...GENERIC_STORAGE_SPACE.OBJECT_IDS.map((objectId) =>
      configureDataObjectSlotCommandApdu(objectId)
    ),
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

async function createAndStoreCardVxCert({
  javaCardConfig,
}: ScriptEnv): Promise<void> {
  sectionLog('🔏', 'Creating and storing card VotingWorks cert...');

  const card = new JavaCard(javaCardConfig);
  await waitForReadyCardStatus(card);
  await card.createAndStoreCardVxCert();
}

/**
 * An initial Java Card configuration script to be run at a VotingWorks facility
 */
export async function main(): Promise<void> {
  try {
    checkForScriptDependencies();
    const scriptEnv = readScriptEnvVars();
    await installApplet();
    await runAppletConfigurationCommands();
    await createAndStoreCardVxCert(scriptEnv);
    sectionLog('✅', 'Done!');
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
