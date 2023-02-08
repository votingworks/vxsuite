// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/vx-mark-backend';

interface ScreenOrientationReturnType {
  isLandscape: boolean;
  isPortrait: boolean;
}

export function screenOrientation(
  machineConfig: MachineConfig
): ScreenOrientationReturnType {
  const isLandscape = machineConfig.screenOrientation === 'landscape';
  const isPortrait = machineConfig.screenOrientation === 'portrait';

  return { isLandscape, isPortrait };
}
