import { ElectionDefinition } from '@votingworks/types'
import { usbstick } from '@votingworks/utils'
import { createContext } from 'react'
import { MachineConfig } from '../config/types'

interface AppContextInterface {
  usbDriveStatus: usbstick.UsbDriveStatus
  usbDriveEject: () => void
  machineConfig: MachineConfig
  electionDefinition?: ElectionDefinition
  electionHash?: string
}

const appContext: AppContextInterface = {
  usbDriveStatus: usbstick.UsbDriveStatus.absent,
  usbDriveEject: () => undefined,
  machineConfig: { machineId: '0000' },
  electionDefinition: undefined,
  electionHash: undefined,
}

const AppContext = createContext(appContext)

export default AppContext
