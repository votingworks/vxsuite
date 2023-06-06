import type { MachineConfig } from '@votingworks/mark-scan-backend';

export function fakeMachineConfig({
  machineId = '000',
  codeVersion = 'test',
  screenOrientation = 'portrait',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { machineId, codeVersion, screenOrientation };
}
