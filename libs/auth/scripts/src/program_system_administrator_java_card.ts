import { assert, extractErrorMessage } from '@votingworks/basics';

import { getRequiredEnvVar } from '../../src/env_vars';
import { JavaCard } from '../../src/java_card';
import { DEV_JURISDICTION } from '../../src/jurisdictions';
import { programSystemAdministratorJavaCard } from './utils';

const nodeEnv = getRequiredEnvVar('NODE_ENV');
assert(
  nodeEnv === 'development' || nodeEnv === 'production',
  'NODE_ENV should be one of development or production'
);
const isProduction = nodeEnv === 'production';
const jurisdiction = isProduction
  ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
  : DEV_JURISDICTION;

/**
 * A script for programming a first system administrator Java Card to bootstrap both production
 * machine usage and local development.
 *
 * Uses the NODE_ENV env var to determine whether to program a production or development card.
 * Programming a production card requires additional production-machine-specific env vars.
 */
export async function main(): Promise<void> {
  try {
    const card = new JavaCard(); // Uses NODE_ENV to determine which config to use
    await programSystemAdministratorJavaCard({
      card,
      isProduction,
      jurisdiction,
    });
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
