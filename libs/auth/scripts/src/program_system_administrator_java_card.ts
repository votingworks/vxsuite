import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';
import { ProgrammingMachineType } from '@votingworks/types';

import { constructJavaCardConfig, JavaCardConfig } from '../../src/config';
import { getRequiredEnvVar, isNodeEnvProduction } from '../../src/env_vars';
import { JavaCard } from '../../src/java_card';
import { DEV_JURISDICTION } from '../../src/jurisdictions';
import { programJavaCard } from './utils';

interface ScriptEnvVars {
  isProduction: boolean;
  javaCardConfig: JavaCardConfig;
  jurisdiction: string;
  machineType: ProgrammingMachineType;
}

function readScriptEnvVars(): ScriptEnvVars {
  const isProduction = isNodeEnvProduction();
  const javaCardConfig = constructJavaCardConfig(); // Uses env vars
  const jurisdiction = isProduction
    ? assertDefined(getRequiredEnvVar('VX_MACHINE_JURISDICTION'))
    : DEV_JURISDICTION;
  const machineType = isProduction
    ? assertDefined(getRequiredEnvVar('VX_MACHINE_TYPE'))
    : 'admin';
  assert(machineType === 'admin' || machineType === 'poll-book');
  return { isProduction, javaCardConfig, jurisdiction, machineType };
}

/**
 * A script for programming a first system administrator Java Card to bootstrap both production
 * machine usage and local development. Uses the NODE_ENV env var to determine whether to program a
 * production or development card. Programming a production card requires additional
 * production-machine-specific env vars.
 */
export async function main(): Promise<void> {
  try {
    const { isProduction, javaCardConfig, jurisdiction, machineType } =
      readScriptEnvVars();
    const card = new JavaCard(javaCardConfig);
    await programJavaCard({
      card,
      isProduction,
      user: {
        role: 'system_administrator',
        jurisdiction,
        programmingMachineType: machineType,
      },
    });
    process.exit(0); // Smart card scripts require an explicit exit or else they hang
  } catch (error) {
    console.error(`❌ ${extractErrorMessage(error)}`);
    process.exit(1);
  }
}
