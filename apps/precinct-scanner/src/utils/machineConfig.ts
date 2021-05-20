import { Provider } from '@votingworks/types'
import { MachineConfig } from '../config/types'
import fetchJSON from './fetchJSON'

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, codeVersion } = await fetchJSON<MachineConfig>(
      '/machine-config'
    )

    return {
      machineId,
      codeVersion,
    }
  },
}

export default machineConfigProvider
