import { DEV_MACHINE_ID } from '@votingworks/types';
import { MachineConfig } from './types';

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
