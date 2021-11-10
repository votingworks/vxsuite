import { Provider, safeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import {
  getAppMode,
  MachineConfig,
  MachineConfigResponseSchema,
} from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { appModeName, machineId, codeVersion } = safeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    ).unsafeUnwrap();

    return {
      appMode: getAppMode(appModeName),
      machineId,
      codeVersion,
    };
  },
};
