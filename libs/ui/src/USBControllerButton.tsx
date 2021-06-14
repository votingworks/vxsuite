import React from 'react'
import { usbstick } from '@votingworks/utils'

import { Button } from './Button'

const { UsbDriveStatus } = usbstick

/* istanbul ignore next */
// eslint-disable-next-line @typescript-eslint/no-empty-function
const doNothing = () => {}

interface Props {
  usbDriveStatus: usbstick.UsbDriveStatus
  usbDriveEject: () => void
  primary?: boolean
  small?: boolean
}

export const USBControllerButton: React.FC<Props> = ({
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
