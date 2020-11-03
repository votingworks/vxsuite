import React, { useContext } from 'react'
import AppContext from '../contexts/AppContext'

import Button from './Button'
import Text from './Text'

import { UsbDriveStatus } from '../lib/usbstick'

const USBController: React.FC = () => {
  const { usbDriveStatus: status, usbDriveEject } = useContext(AppContext)

  if (status === UsbDriveStatus.notavailable) {
    return null
  }

  if (status === UsbDriveStatus.absent) {
    return <Text>No USB</Text>
  }

  if (status === UsbDriveStatus.present) {
    return <Text>Connecting…</Text>
  }

  if (status === UsbDriveStatus.recentlyEjected) {
    return <Text>Ejected</Text>
  }

  return (
    <Button small onPress={usbDriveEject}>
      Eject USB
    </Button>
  )
}

export default USBController
