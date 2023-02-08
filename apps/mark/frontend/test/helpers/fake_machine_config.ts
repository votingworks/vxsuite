// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/mark-backend';

export function fakeMachineConfig({
  machineId = '000',
  codeVersion = 'test',
  screenOrientation = 'portrait',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { machineId, codeVersion, screenOrientation };
}
