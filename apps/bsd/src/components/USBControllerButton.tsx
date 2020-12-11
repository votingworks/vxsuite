import React, { useContext } from 'react'
import AppContext from '../contexts/AppContext'

import Button from './Button'

import { UsbDriveStatus } from '../lib/usbstick'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => {}

const USBControllerButton: React.FC<{ primary?: boolean; small?: boolean }> = ({
  primary = false,
  small = true,
}) => {
  const { usbDriveStatus: status, usbDriveEject } = useContext(AppContext)

  if (status === UsbDriveStatus.notavailable) {
    return null
  }

  if (status === UsbDriveStatus.absent) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        No USB
      </Button>
    )
  }

  if (status === UsbDriveStatus.present) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Connecting…
      </Button>
    )
  }

  if (status === UsbDriveStatus.recentlyEjected) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Ejected
      </Button>
    )
  }

  if (status === UsbDriveStatus.ejecting) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Ejecting…
      </Button>
    )
  }

  return (
    <Button small={small} primary={primary} onPress={usbDriveEject}>
      Eject USB
    </Button>
  )
}

export default USBControllerButton
