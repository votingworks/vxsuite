import {
  safeParse,
  AppMode,
  AppModeKeys,
  AppModeKeysSchema,
  MarkAndPrint,
  MarkOnly,
  PrintOnly,
} from '@votingworks/types';
import { MachineConfig } from './types';

export function getAppMode(key: AppModeKeys): AppMode {
  switch (key) {
    case PrintOnly.key:
      return PrintOnly;
    case MarkOnly.key:
      return MarkOnly;
    case MarkAndPrint.key:
      return MarkAndPrint;
    default:
      throw new Error(`unknown app mode: ${key}`);
  }
}

export function getMachineConfig(): MachineConfig {
  const appModeKey = safeParse(AppModeKeysSchema, process.env.VX_APP_MODE).ok();

  return {
    appMode: getAppMode(appModeKey ?? 'MarkAndPrint'),
    machineId: process.env.VX_MACHINE_ID || '0000',
    codeVersion: process.env.VX_CODE_VERSION || 'dev',
    screenOrientation: process.env.VX_SCREEN_ORIENTATION ?? 'portrait',
  };
}
