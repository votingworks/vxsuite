import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfigResponseSchema } from '../config/types';

export const machineConfigProvider: Provider<{
  machineId: string;
  bypassAuthentication: boolean;
}> = {
  async get() {
    const { machineId, bypassAuthentication } = unsafeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    );

    return {
      machineId,
      bypassAuthentication,
    };
  },
};
