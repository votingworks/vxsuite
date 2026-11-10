import { DEV_JURISDICTION } from '@votingworks/auth';
import { DEV_MACHINE_ID, TEST_JURISDICTION } from '@votingworks/types';
import { isIntegrationTest, isNodeEnvProduction } from '@votingworks/utils';
import type { MachineConfig } from './types.js';

/**
 * Returns the ID of the current machine and the version of the currently
 * running software.
 */
export function getMachineConfig(): MachineConfig {
  return {
    machineId: process.env.VX_MACHINE_ID || DEV_MACHINE_ID,
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
  };
}

/**
 * Returns the jurisdiction this machine belongs to. Kept apart from
 * {@link getMachineConfig}, whose result is handed to the frontend: a
 * jurisdiction is something the machine is checked against, not something it
 * reports.
 */
export function getMachineJurisdiction(): string {
  // @coverage-exclude: covered by integration testing
  return isIntegrationTest()
    ? TEST_JURISDICTION
    : (process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION);
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
