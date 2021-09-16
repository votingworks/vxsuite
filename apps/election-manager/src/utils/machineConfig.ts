import { Provider } from '@votingworks/types'
import { fetchJSON } from '@votingworks/utils'
import { MachineConfig } from '../config/types'

export const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const {
      machineId,
      codeVersion,
      bypassAuthentication,
    } = await fetchJSON<MachineConfig>('/machine-config')

    return {
      machineId,
      codeVersion,
      bypassAuthentication,
    }
  },
}
