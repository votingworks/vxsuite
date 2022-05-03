import { Provider } from '@votingworks/types';
import { MarkOnly, MachineConfig } from '../../src/config/types';

export function fakeMachineConfig({
  appMode = MarkOnly,
  machineId = '000',
  codeVersion = 'test',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { appMode, machineId, codeVersion };
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
