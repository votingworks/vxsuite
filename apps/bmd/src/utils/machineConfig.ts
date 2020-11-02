import {
  Provider,
  MachineConfig,
  getAppMode,
  AppModeNames,
} from '../config/types'
import fetchJSON from './fetchJSON'

interface MachineConfigResponse {
  machineId: string
  appMode: AppModeNames
}

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const { machineId, appMode } = await fetchJSON<MachineConfigResponse>(
      '/machine-config'
    )

    return {
      machineId,
      appMode: getAppMode(appMode),
    }
  },
}

export default machineConfigProvider
