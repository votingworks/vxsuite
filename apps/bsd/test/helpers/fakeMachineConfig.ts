import { Provider, MachineConfig } from '../../src/config/types'

export default function fakeMachineConfig({
  machineId = '000',
}: Partial<MachineConfig> = {}): MachineConfig {
  return { machineId }
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
