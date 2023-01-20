export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export function getMachineConfig(): MachineConfig {
  return {
    machineId: process.env.VX_MACHINE_ID || '0000',
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
  };
}
