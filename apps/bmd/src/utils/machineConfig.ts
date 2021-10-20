import { Provider, safeParse } from '@votingworks/types';
import { fetchJSON } from '@votingworks/utils';
import {
  getAppMode,
  MachineConfig,
  MachineConfigResponseSchema,
} from '../config/types';

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { appModeName, machineId, codeVersion } = safeParse(
      MachineConfigResponseSchema,
      await fetchJSON('/machine-config')
    ).unsafeUnwrap();

    return {
      appMode: getAppMode(appModeName),
      machineId,
      codeVersion,
    };
  },
};

export default machineConfigProvider;
