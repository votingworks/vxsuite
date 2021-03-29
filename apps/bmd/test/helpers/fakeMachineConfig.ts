import { Provider } from '@votingworks/types'
import { VxMarkOnly, MachineConfig } from '../../src/config/types'

export default function fakeMachineConfig({
  appMode = VxMarkOnly,
  machineId = '000',
  codeVersion = 'test',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { appMode, machineId, codeVersion }
}

export function fakeMachineConfigProvider(
  props: Partial<MachineConfig> = {}
): Provider<MachineConfig> {
  const config = fakeMachineConfig(props)
  return {
    async get() {
      return config
    },
  }
}
