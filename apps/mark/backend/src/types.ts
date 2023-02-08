export interface MachineConfig {
  machineId: string;
  codeVersion: string;
  screenOrientation: ScreenOrientation;
}

export type ScreenOrientation = 'portrait' | 'landscape';
