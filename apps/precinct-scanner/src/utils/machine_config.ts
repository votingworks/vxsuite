import { Provider, safeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfig, MachineConfigResponseSchema } from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion, bypassAuthentication } = safeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    ).unsafeUnwrap();

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
    };
  },
};
