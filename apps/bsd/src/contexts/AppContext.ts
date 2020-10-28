import { createContext } from 'react'

interface AppContextInterface {
  usbDriveStatus: string
  usbDriveEject: () => void
}

const appContext: AppContextInterface = {
  usbDriveStatus: '',
  usbDriveEject: () => undefined,
}

const AppContext = createContext(appContext)

export default AppContext
