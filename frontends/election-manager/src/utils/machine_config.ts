import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfig, MachineConfigSchema } from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion, bypassAuthentication, converter } =
      unsafeParse(MachineConfigSchema, await fetchJson('/machine-config'));

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
      converter,
    };
  },
};
