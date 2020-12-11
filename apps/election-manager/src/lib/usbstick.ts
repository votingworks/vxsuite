const isAvailable = () => {
  return !!window.kiosk
}

export enum UsbDriveStatus {
  notavailable = 'notavailable',
  absent = 'absent',
  present = 'present',
  mounted = 'mounted',
  recentlyEjected = 'recentlyEjected',
  ejecting = 'ejecting',
}

const getDevice = async () => {
  return (await window.kiosk!.getUsbDrives())[0]
}

export const getDevicePath = async (): Promise<string | undefined> => {
  if (!isAvailable()) {
    return
  }
  const device = await getDevice()
  return device.mountPoint
}

export const getStatus = async (): Promise<UsbDriveStatus> => {
  if (!isAvailable()) {
    return UsbDriveStatus.notavailable
  }

  const device = await getDevice()

  if (!device) {
    return UsbDriveStatus.absent
  }

  if (device.mountPoint) {
    return UsbDriveStatus.mounted
  }
  return UsbDriveStatus.present
}

export const doMount = async (): Promise<void> => {
  if (!isAvailable()) {
    return
  }

  const device = await getDevice()
  if (device.mountPoint) {
    return
  }

  window.kiosk!.mountUsbDrive(device.deviceName)
}

export const doUnmount = async (): Promise<void> => {
  if (!isAvailable()) {
    return
  }

  const device = await getDevice()
  if (!device.mountPoint) {
    return
  }

  window.kiosk!.unmountUsbDrive(device.deviceName)
  return await new Promise((resolve) => setTimeout(resolve, 10000))
}
