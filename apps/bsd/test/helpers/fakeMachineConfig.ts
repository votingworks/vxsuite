import { Provider } from '@votingworks/types'
import { MachineConfig } from '../../src/config/types'

export default function fakeMachineConfig({
  machineId = '0000',
  bypassAuthentication = true,
}: Partial<MachineConfig> = {}): MachineConfig {
  return { machineId, bypassAuthentication }
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
