import { Provider, unsafeParse } from '@votingworks/types';
import { fetchJson } from '@votingworks/utils';
import { MachineConfig, MachineConfigResponseSchema } from '../config/types';

/**
 * Gets values for the machine config that should override those from the
 * `/machine-config` API. This is only used for development.
 */
function getOverrides(): Partial<MachineConfig> {
  return {
    machineId: process.env.REACT_APP_VX_MACHINE_ID,
    codeVersion: process.env.REACT_APP_VX_CODE_VERSION,
  };
}

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion } = unsafeParse(
      MachineConfigResponseSchema,
      await fetchJson('/machine-config')
    );

    const overrides =
      process.env.NODE_ENV === 'development' ? getOverrides() : {};

    return {
      machineId: overrides.machineId ?? machineId,
      codeVersion: overrides.codeVersion ?? codeVersion,
    };
  },
};
