import { Provider } from '../config/types'
import fetchJSON from './fetchJSON'

interface MachineConfigResponse {
  machineId: string
}

const machineConfigProvider: Provider<{ machineId: string }> = {
  async get() {
    const { machineId } = await fetchJSON<MachineConfigResponse>(
      '/machine-config'
    )

    return {
      machineId,
    }
  },
}

export default machineConfigProvider
