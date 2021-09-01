import { Provider } from '@votingworks/types'
import { fetchJSON } from '@votingworks/utils'
import {
  MachineConfig,
  MachineConfigResponse,
  getAppMode,
} from '../config/types'

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const {
      appModeName,
      machineId,
      codeVersion,
    } = await fetchJSON<MachineConfigResponse>('/machine-config')

    return {
      machineId,
      codeVersion,
      appMode: getAppMode(appModeName),
    }
  },
}

export default machineConfigProvider
