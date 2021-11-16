import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfig, MachineConfigResponseSchema } from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion, bypassAuthentication } = unsafeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    );

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
    };
  },
};
