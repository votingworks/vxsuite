import { Buffer } from 'buffer';
import { existsSync } from 'fs';
import { extractErrorMessage } from '@votingworks/basics';
import { Byte } from '@votingworks/types';

import { CommandApdu, constructTlv } from '../src/apdu';
import { getRequiredEnvVar } from '../src/env_vars';
import {
  CARD_VX_ADMIN_CERT,
  CARD_VX_CERT,
  DEFAULT_PIN,
  GENERIC_STORAGE_SPACE,
  JavaCard,
  MAX_NUM_INCORRECT_PIN_ATTEMPTS,
  OPEN_FIPS_201_AID,
  PUK,
  VX_ADMIN_CERT_AUTHORITY_CERT,
} from '../src/java_card';
import {
  construct8BytePinBuffer,
  CRYPTOGRAPHIC_ALGORITHM_IDENTIFIER,
} from '../src/piv';
import { runCommand } from '../src/shell';
import { waitForReadyCardStatus } from './utils';

const APPLET_PATH = 'applets/OpenFIPS201-v1.10.2-with-vx-mods.cap';
const GLOBAL_PLATFORM_JAR_FILE_PATH = 'scripts/gp.jar';

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
      'Missing script dependencies; install using `make install-script-dependencies`'
    );
  }
}

/**
 * An initial Java Card configuration script to be run at the Bakery
 */
export async function main(): Promise<void> {
  try {
    checkForScriptDependencies();
    const card = new JavaCard();
    await waitForReadyCardStatus(card);
    const result = await card.checkPin('77777777');
    //const result = await card.checkPin('757287');
    console.log("PIN? " + JSON.stringify(result));
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
  sectionLog('✅', 'Done!');
  process.exit(0);
}
