const isAvailable = () => {
  return !!window.kiosk
}

export enum UsbDriveStatus {
  notavailable = 'notavailable',
  absent = 'absent',
  present = 'present',
  mounted = 'mounted',
}

const getDevice = async () => {
  return (await window.kiosk!.getUsbDrives())[0]
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

export const doMount = async () => {
  if (!isAvailable()) {
    return
  }

  const device = await getDevice()
  if (device.mountPoint) {
    return
  }

  window.kiosk!.mountUsbDrive(device.deviceName)
}

export const doUnmount = async () => {
  if (!isAvailable()) {
    return
  }

  const device = await getDevice()
  if (!device.mountPoint) {
    return
  }

  window.kiosk!.unmountUsbDrive(device.deviceName)
}
