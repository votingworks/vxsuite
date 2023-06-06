import { MachineConfig } from './types';

export function getMachineConfig(): MachineConfig {
  return {
    machineId: process.env.VX_MACHINE_ID || '0000',
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
    screenOrientation: process.env.VX_SCREEN_ORIENTATION ?? 'portrait',
  };
}
