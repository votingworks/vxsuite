import React from 'react'
import { Button } from '@votingworks/ui'

import { UsbDriveStatus } from '../utils/usbstick'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => {}

interface Props {
  usbDriveStatus: UsbDriveStatus
  usbDriveEject: () => void
  primary?: boolean
  small?: boolean
}

const USBControllerButton: React.FC<Props> = ({
  usbDriveStatus,
  usbDriveEject,
  primary = false,
  small = true,
}) => {
  if (usbDriveStatus === UsbDriveStatus.notavailable) {
    return null
  }

  if (usbDriveStatus === UsbDriveStatus.absent) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        No USB
      </Button>
    )
  }

  if (usbDriveStatus === UsbDriveStatus.present) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Connecting…
      </Button>
    )
  }

  if (usbDriveStatus === UsbDriveStatus.recentlyEjected) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Ejected
      </Button>
    )
  }

  if (usbDriveStatus === UsbDriveStatus.ejecting) {
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
