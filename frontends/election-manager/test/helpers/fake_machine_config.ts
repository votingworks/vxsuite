import { Provider } from '@votingworks/types';
import { MachineConfig } from '../../src/config/types';

export function fakeMachineConfig({
  machineId = '000',
  codeVersion = 'test',
  bypassAuthentication = false,
  converter = 'ms-sems',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { machineId, codeVersion, bypassAuthentication, converter };
}

export function fakeMachineConfigProvider(
  props: Partial<MachineConfig> = {}
): Provider<MachineConfig> {
  const config = fakeMachineConfig(props);
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async get() {
      return config;
    },
  };
}
