import { Provider, safeParse, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import {
  AppModeKeysSchema,
  getAppMode,
  MachineConfig,
  MachineConfigResponseSchema,
} from '../config/types';

/**
 * Gets values for the machine config that should override those from the
 * `/machine-config` API. This is only used for development.
 */
function getOverrides(): Partial<MachineConfig> {
  const appModeKey = safeParse(
    AppModeKeysSchema,
    process.env.REACT_APP_VX_APP_MODE
  ).ok();

  return {
    appMode: appModeKey ? getAppMode(appModeKey) : undefined,
    machineId: process.env.REACT_APP_VX_MACHINE_ID,
    codeVersion: process.env.REACT_APP_VX_CODE_VERSION,
    screenOrientation: process.env.REACT_APP_VX_SCREEN_ORIENTATION,
  };
}

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { appModeKey, machineId, codeVersion, screenOrientation } =
      unsafeParse(
        MachineConfigResponseSchema,
        await fetchJson('/machine-config')
      );

    const overrides =
      process.env.NODE_ENV === 'development' ? getOverrides() : {};

    return {
      appMode: overrides.appMode ?? getAppMode(appModeKey),
      machineId: overrides.machineId ?? machineId,
      codeVersion: overrides.codeVersion ?? codeVersion,
      screenOrientation: overrides.screenOrientation ?? screenOrientation,
    };
  },
};
