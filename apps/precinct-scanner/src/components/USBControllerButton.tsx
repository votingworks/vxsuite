import React from 'react'
import { Button } from '@votingworks/ui'
import { usbstick } from '@votingworks/utils'

// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => {}

interface Props {
  usbDriveStatus: usbstick.UsbDriveStatus
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
  if (usbDriveStatus === usbstick.UsbDriveStatus.notavailable) {
    return null
  }

  if (usbDriveStatus === usbstick.UsbDriveStatus.absent) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        No USB
      </Button>
    )
  }

  if (usbDriveStatus === usbstick.UsbDriveStatus.present) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Connecting…
      </Button>
    )
  }

  if (usbDriveStatus === usbstick.UsbDriveStatus.recentlyEjected) {
    return (
      <Button small={small} disabled onPress={doNothing}>
        Ejected
      </Button>
    )
  }

  if (usbDriveStatus === usbstick.UsbDriveStatus.ejecting) {
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
