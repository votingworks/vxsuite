import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import {
  getAppMode,
  MachineConfig,
  MachineConfigResponseSchema,
} from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { appModeName, machineId, codeVersion } = unsafeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    );

    return {
      appMode: getAppMode(appModeName),
      machineId,
      codeVersion,
    };
  },
};
