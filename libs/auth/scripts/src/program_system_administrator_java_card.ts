import { extractErrorMessage } from '@votingworks/basics';

import { constructJavaCardConfig, JavaCardConfig } from '../../src/config';
import { getRequiredEnvVar, isNodeEnvProduction } from '../../src/env_vars';
import { JavaCard } from '../../src/java_card';
import { DEV_JURISDICTION } from '../../src/jurisdictions';
import { programJavaCard } from './utils';

interface ScriptEnv {
  isProduction: boolean;
  javaCardConfig: JavaCardConfig;
  jurisdiction: string;
}

function readScriptEnvVars(): ScriptEnv {
  const isProduction = isNodeEnvProduction();
  const javaCardConfig = constructJavaCardConfig(); // Uses env vars
  const jurisdiction = isProduction
    ? getRequiredEnvVar('VX_MACHINE_JURISDICTION')
    : DEV_JURISDICTION;
  return { isProduction, javaCardConfig, jurisdiction };
}

/**
 * A script for programming a first system administrator Java Card to bootstrap both production
 * machine usage and local development. Uses the NODE_ENV env var to determine whether to program a
 * production or development card. Programming a production card requires additional
 * production-machine-specific env vars.
 */
export async function main(): Promise<void> {
  try {
    const { isProduction, javaCardConfig, jurisdiction } = readScriptEnvVars();
    const card = new JavaCard(javaCardConfig);
    await programJavaCard({
      card,
      isProduction,
      user: { role: 'system_administrator', jurisdiction },
    });
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
