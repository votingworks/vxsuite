import React from 'react'
import { fireEvent, render } from '@testing-library/react'

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
  const eject = jest.fn()
  const { container, getByText } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.absent}
      usbDriveEject={eject}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('No USB')
  fireEvent.click(getByText('No USB'))
  expect(eject).not.toHaveBeenCalled()
})

test('shows eject if mounted', () => {
  const eject = jest.fn()
  const { container, getByText } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.mounted}
      usbDriveEject={eject}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Eject USB')
  fireEvent.click(getByText('Eject USB'))
  expect(eject).toHaveBeenCalled()
})

test('shows ejected if recently ejected', () => {
  const eject = jest.fn()
  const { container, getByText } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.recentlyEjected}
      usbDriveEject={eject}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Ejected')
  fireEvent.click(getByText('Ejected'))
  expect(eject).not.toHaveBeenCalled()
})

test('shows connecting while mounting', () => {
  const eject = jest.fn()
  const { container, getByText } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.present}
      usbDriveEject={eject}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Connecting…')
  fireEvent.click(getByText('Connecting…'))
  expect(eject).not.toHaveBeenCalled()
})

test('shows ejecting while ejecting', () => {
  const eject = jest.fn()
  const { container, getByText } = render(
    <USBControllerButton
      usbDriveStatus={UsbDriveStatus.ejecting}
      usbDriveEject={eject}
    />
  )

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot('Ejecting…')
  fireEvent.click(getByText('Ejecting…'))
  expect(eject).not.toHaveBeenCalled()
})
