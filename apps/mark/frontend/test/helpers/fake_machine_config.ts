// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/mark-backend';
import { MarkOnly } from '@votingworks/types';

export function fakeMachineConfig({
  appMode = MarkOnly,
  machineId = '000',
  codeVersion = 'test',
  screenOrientation = 'portrait',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { appMode, machineId, codeVersion, screenOrientation };
}
