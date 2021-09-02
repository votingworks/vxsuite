import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
} from '@votingworks/test-utils'
import { usbstick } from '@votingworks/utils'
import React from 'react'
import { Button } from '../Button'
import { USBControllerButton } from '../USBControllerButton'
import { useUsbDrive, POLLING_INTERVAL_FOR_USB } from './useUsbDrive'

const { UsbDriveStatus } = usbstick

const MOUNTED_DRIVE = fakeUsbDrive()
const UNMOUNTED_DRIVE = fakeUsbDrive({ mountPoint: undefined })

async function waitForStatusUpdate(): Promise<void> {
  await advanceTimersAndPromises(POLLING_INTERVAL_FOR_USB / 1000)
}

async function waitForIOFlush(): Promise<void> {
  await advanceTimersAndPromises(usbstick.FLUSH_IO_DELAY_MS / 1000)
}

beforeEach(() => {
  delete window.kiosk
  jest.useFakeTimers()
})

const TestComponent = () => {
  const usbDrive = useUsbDrive()
  return (
    <React.Fragment>
      <div>{typeof usbDrive.status}</div> <div>{usbDrive.status}</div>
      <Button onPress={usbDrive.eject}>Eject</Button>
    </React.Fragment>
  )
}

test('returns undefined status at first', async () => {
  render(<TestComponent />)
  screen.getByText('undefined')

  await waitForStatusUpdate()
})

test('returns notavailable if no kiosk', async () => {
  render(<TestComponent />)
  await waitForStatusUpdate()
  screen.getByText(usbstick.UsbDriveStatus.notavailable)
})

test('returns the status after the first tick', async () => {
  const kiosk = fakeKiosk()
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE])
  window.kiosk = kiosk

  render(<TestComponent />)
  await waitForStatusUpdate()
  screen.getByText(usbstick.UsbDriveStatus.mounted)
})

test('full lifecycle with USBControllerButton', async () => {
  const ThisTestComponent = () => {
    const usbDrive = useUsbDrive()
    return (
      <USBControllerButton
        usbDriveStatus={usbDrive.status ?? UsbDriveStatus.absent}
        usbDriveEject={usbDrive.eject}
      />
    )
  }

  const kiosk = fakeKiosk()
  kiosk.getUsbDrives.mockResolvedValue([])
  window.kiosk = kiosk

  // wait for initial status
  render(<ThisTestComponent />)
  await waitForStatusUpdate()
  screen.getByText('No USB')

  // let some time go by
  await waitForStatusUpdate()
  await waitForStatusUpdate()

  // plug in a USB drive
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE])
  await waitForStatusUpdate()
  expect(kiosk.mountUsbDrive).toHaveBeenCalled()
  screen.getByText('Connecting…')

  // wait for it to mount
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE])
  await waitForStatusUpdate()
  screen.getByText('Eject USB')

  // begin eject
  userEvent.click(screen.getByText('Eject USB'))
  screen.getByText('Ejecting…')

  // ejecting unmounts but does not remove USB drives
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE])
  screen.getByText('Ejecting…')

  await waitForStatusUpdate()
  expect(kiosk.unmountUsbDrive).toHaveBeenCalled()

  await waitForIOFlush()

  await waitForStatusUpdate()
  screen.getByText('Ejected')

  // remove the USB drive
  kiosk.getUsbDrives.mockResolvedValue([])
  await waitForStatusUpdate()
  screen.getByText('No USB')
})

test('usb drive gets mounted from undefined state', async () => {
  render(<TestComponent />)
  screen.getByText('undefined')
  const kiosk = fakeKiosk()
  kiosk.getUsbDrives.mockResolvedValue([])
  window.kiosk = kiosk
  kiosk.getUsbDrives.mockResolvedValue([UNMOUNTED_DRIVE])
  await waitForStatusUpdate()
  expect(kiosk.mountUsbDrive).toHaveBeenCalled()
  screen.getByText('present')

  // wait for it to mount
  kiosk.getUsbDrives.mockResolvedValue([MOUNTED_DRIVE])
  await waitForStatusUpdate()
  screen.getByText('mounted')
})
