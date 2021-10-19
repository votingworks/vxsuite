import { Provider } from '@votingworks/types';
import { fetchJSON } from '@votingworks/utils';
import { MachineConfigResponse } from '../config/types';

const machineConfigProvider: Provider<{
  machineId: string;
  bypassAuthentication: boolean;
}> = {
  async get() {
    const {
      machineId,
      bypassAuthentication,
    } = await fetchJSON<MachineConfigResponse>('/machine-config');

    return {
      machineId,
      bypassAuthentication,
    };
  },
};

export default machineConfigProvider;
