import { Provider } from '../../src/config/types'

export default function fakeMachineId(): Provider<string> {
  return {
    async get() {
      return '000'
    },
  }
}
