import { MachineConfig } from '@votingworks/vx-mark-backend';
import { MarkOnly } from '@votingworks/types';

export function fakeMachineConfig({
  appMode = MarkOnly,
  machineId = '000',
  codeVersion = 'test',
  screenOrientation = 'portrait',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { appMode, machineId, codeVersion, screenOrientation };
}
