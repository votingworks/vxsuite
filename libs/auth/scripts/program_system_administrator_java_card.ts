import { assert, extractErrorMessage } from '@votingworks/basics';
import { generatePin, hyphenatePin } from '@votingworks/utils';

import { ResponseApduError } from '../src/apdu';
import { getRequiredEnvVar } from '../src/env_vars';
import { JavaCard } from '../src/java_card';
import { DEV_JURISDICTION } from '../src/jurisdictions';
import { waitForReadyCardStatus } from './utils';

const nodeEnv = getRequiredEnvVar('NODE_ENV');
assert(
  nodeEnv === 'development' || nodeEnv === 'production',
  'NODE_ENV should be one of development or production'
);
const isProduction = nodeEnv === 'production';
const jurisdiction = isProduction
  ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
  : DEV_JURISDICTION;

const initialJavaCardConfigurationScriptReminder = `
${
  isProduction
    ? 'Have you run this card through the initial Java Card configuration script on VxCertifier yet?'
    : 'Have you run `./scripts/configure-dev-java-card` on this card yet?'
}
If not, that's likely the cause of this error.
Run that and then retry.
`;

async function programSystemAdministratorJavaCard(): Promise<string> {
  const card = new JavaCard(); // Uses NODE_ENV to determine which config to use
  await waitForReadyCardStatus(card);

  const pin = isProduction ? generatePin() : '000000';
  try {
    await card.program({
      user: { role: 'system_administrator', jurisdiction },
      pin,
    });
  } catch (error) {
    if (error instanceof ResponseApduError) {
      throw new Error(
        `${error.message}\n${initialJavaCardConfigurationScriptReminder}`
      );
    }
    throw error;
  }
  return pin;
}

/**
 * A script for programming a first system administrator Java Card to bootstrap both production
 * machine usage and local development.
 *
 * Uses the NODE_ENV env var to determine whether to program a production or development card.
 * Programming a production card requires additional production-machine-specific env vars.
 */
export async function main(): Promise<void> {
  let pin: string;
  try {
    pin = await programSystemAdministratorJavaCard();
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
  console.log(`✅ Done! Card PIN is ${hyphenatePin(pin)}.`);
  process.exit(0);
}
