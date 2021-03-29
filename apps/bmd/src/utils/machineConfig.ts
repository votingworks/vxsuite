import { Provider } from '@votingworks/types'
import {
  MachineConfig,
  MachineConfigResponse,
  getAppMode,
} from '../config/types'
import fetchJSON from './fetchJSON'

const machineConfigProvider: Provider<MachineConfig> = {
  async get() {
    const {
      appModeName,
      machineId,
      codeVersion,
    } = await fetchJSON<MachineConfigResponse>('/machine-config')

    return {
      appMode: getAppMode(appModeName),
      machineId,
      codeVersion,
    }
  },
}

export default machineConfigProvider
