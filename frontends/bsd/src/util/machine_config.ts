import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfigResponseSchema } from '../config/types';

export const machineConfigProvider: Provider<{
  machineId: string;
  codeVersion: string;
  bypassAuthentication: boolean;
}> = {
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
