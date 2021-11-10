import { Provider, safeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfigResponseSchema } from '../config/types';

export const machineConfigProvider: Provider<{
  machineId: string;
  bypassAuthentication: boolean;
}> = {
  async get() {
    const { machineId, bypassAuthentication } = safeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    ).unsafeUnwrap();

    return {
      machineId,
      bypassAuthentication,
    };
  },
};
