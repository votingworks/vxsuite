import fakeKiosk from '../../test/helpers/fakeKiosk'
import {
  isAvailable,
  isPresent,
  isMounted,
  doMount,
  doUnmount,
} from './usbstick'

const mountedDevices = [
  {
    deviceName: 'sdb',
    mountPoint: '/media/usb-drive-sdb',
  },
]

const unmountedDevices = [
  {
    deviceName: 'sdb',
  },
]

test('knows USB is available', () => {
  window.kiosk = fakeKiosk()
  expect(isAvailable()).toBe(true)
})

test('sees mounted USB drive', async () => {
  const fKiosk = fakeKiosk()
  window.kiosk = fKiosk

  fKiosk.getUsbDrives.mockResolvedValue(mountedDevices)
  expect(await isPresent()).toBe(true)
  expect(await isMounted()).toBe(true)

  fKiosk.getUsbDrives.mockResolvedValue(unmountedDevices)
  expect(await isPresent()).toBe(true)
  expect(await isMounted()).toBe(false)
})

test('can mount and unmount USB drive', async () => {
  const fKiosk = fakeKiosk()
  window.kiosk = fKiosk

  fKiosk.getUsbDrives.mockResolvedValue(unmountedDevices)

  // unmount should do nothing
  await doUnmount()
  expect(window.kiosk.unmountUsbDrive).not.toBeCalled()

  await doMount()
  expect(window.kiosk.mountUsbDrive).toBeCalledWith('sdb')

  const fKiosk2 = fakeKiosk()
  window.kiosk = fKiosk2
  fKiosk2.getUsbDrives.mockResolvedValue(mountedDevices)

  // mount should do nothing
  await doMount()
  expect(window.kiosk.mountUsbDrive).not.toBeCalled()

  await doUnmount()
  expect(window.kiosk.unmountUsbDrive).toBeCalledWith('sdb')
})

test('without a kiosk, calls do not crash', async () => {
  window.kiosk = undefined
  expect(isAvailable()).toBe(false)
  expect(await isPresent()).toBe(false)
  expect(await isMounted()).toBe(false)

  await doMount()
  await doUnmount()
})
