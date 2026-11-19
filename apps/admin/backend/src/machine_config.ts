import { DEV_JURISDICTION } from '@votingworks/auth';
import { DEV_MACHINE_ID, TEST_JURISDICTION } from '@votingworks/types';
import { isIntegrationTest, isNodeEnvProduction } from '@votingworks/utils';
import type { MachineConfig } from './types.js';

/**
 * Returns the jurisdiction this machine belongs to, which cards and backups
 * are checked against.
 */
export function getMachineJurisdiction(): string {
  // @coverage-exclude: covered by integration testing
  return isIntegrationTest()
    ? TEST_JURISDICTION
    : (process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION);
}

/**
 * Returns the ID and jurisdiction of the current machine and the version of
 * the currently running software.
 */
export function getMachineConfig(): MachineConfig {
  return {
    machineId: process.env.VX_MACHINE_ID || DEV_MACHINE_ID,
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
    jurisdiction: getMachineJurisdiction(),
  };
}

/**
 * Returns the state this machine is configured for, which determines the
 * election definition presets. Set by the machine configuration wizard, and
 * defaults to the demo state outside of production.
 */
export function getMachineStateSetting(): string | undefined {
  return (
    process.env.VX_MACHINE_STATE ?? (isNodeEnvProduction() ? undefined : 'DEMO')
  );
}
