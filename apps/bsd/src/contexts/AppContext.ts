import { createContext } from 'react'
import { MachineConfig } from '../config/types'

interface AppContextInterface {
  usbDriveStatus: string
  usbDriveEject: () => void
  machineConfig: MachineConfig
}

const appContext: AppContextInterface = {
  usbDriveStatus: '',
  usbDriveEject: () => undefined,
  machineConfig: { machineId: '0000' },
}

const AppContext = createContext(appContext)

export default AppContext
