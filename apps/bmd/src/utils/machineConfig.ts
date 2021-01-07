import {
  Provider,
  MachineConfig,
  MachineConfigResponse,
  getAppMode,
} from '../config/types'
import fetchJSON from './fetchJSON'

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { appModeName, machineId } = await fetchJSON<MachineConfigResponse>(
      '/machine-config'
    )

    return {
      appMode: getAppMode(appModeName),
      machineId,
    }
  },
}

export default machineConfigProvider
