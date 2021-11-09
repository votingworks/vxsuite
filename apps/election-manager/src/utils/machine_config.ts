import { Provider, safeParse } from '@votingworks/types';
import { fetchJSON } from '@votingworks/utils';
import { MachineConfig, MachineConfigSchema } from '../config/types';

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion, bypassAuthentication } = safeParse(
      MachineConfigSchema,
      await fetchJSON('/machine-config')
    ).unsafeUnwrap();

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
    };
  },
};
