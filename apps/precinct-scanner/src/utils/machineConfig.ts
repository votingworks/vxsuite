import { Provider, safeParse } from '@votingworks/types';
import { fetchJSON } from '@votingworks/utils';
import { MachineConfig, MachineConfigResponseSchema } from '../config/types';

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion, bypassAuthentication } = safeParse(
      MachineConfigResponseSchema,
      await fetchJSON('/machine-config')
    ).unsafeUnwrap();

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
    };
  },
};

export default machineConfigProvider;
