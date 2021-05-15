import React from 'react'
import { render } from '@testing-library/react'

import { usbstick } from '@votingworks/utils'
import { USBControllerButton } from './USBControllerButton'

const { UsbDriveStatus } = usbstick

beforeAll(() => {
  jest.useFakeTimers()
})

afterAll(() => {
  jest.useRealTimers()
  delete window.kiosk
})

test('shows nothing if USB not available', () => {
  const { container } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.notavailable}
      usbDriveEject={jest.fn()}
    />
  )

  expect(container.firstChild).toMatchInlineSnapshot('null')
})

test('shows No USB if usb available but absent', () => {
  const { container } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.absent}
      usbDriveEject={jest.fn()}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('No USB')
})

test('shows eject if mounted', () => {
  const { container } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.mounted}
      usbDriveEject={jest.fn()}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Eject USB')
})

test('shows ejected if recently ejected', () => {
  const { container } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.recentlyEjected}
      usbDriveEject={jest.fn()}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Ejected')
})
