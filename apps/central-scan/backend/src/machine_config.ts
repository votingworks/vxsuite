import { DEV_MACHINE_ID } from '@votingworks/types';
import { MachineConfig } from './types.js';

export function getMachineConfig(): MachineConfig {
  return {
    machineId: process.env.VX_MACHINE_ID || DEV_MACHINE_ID,
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
  };
}
