import { MachineConfig } from '../config/types';

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
