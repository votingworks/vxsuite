import { Provider } from '../config/types'
import fetchJSON from './fetchJSON'

interface MachineIdResponse {
  machineId: string
}

const machineIdProvider: Provider<string> = {
  async get() {
    const body = await fetchJSON<MachineIdResponse>('/machine-id')
    return body.machineId
  },
}

export default machineIdProvider
