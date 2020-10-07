import { render } from '@testing-library/react'
import React from 'react'

import USBControllerButton from './USBControllerButton'

import AppContext from '../contexts/AppContext'
import { UsbDriveStatus } from '../lib/usbstick'

jest.mock('../lib/usbstick')

beforeAll(() => {
  jest.useFakeTimers()
})

afterAll(() => {
  jest.useRealTimers()
  delete window.kiosk
})

const renderWithStatus = (status: UsbDriveStatus) => {
  return render(
    <AppContext.Provider
      value={{
        usbDriveStatus: status,
        usbDriveEject: jest.fn(),
      }}
    >
      <USBControllerButton />
    </AppContext.Provider>
  )
}

test('shows nothing if USB not available', () => {
  const { container } = renderWithStatus(UsbDriveStatus.notavailable)

  expect(container.firstChild).toMatchInlineSnapshot(`null`)
})

test('shows No USB if usb available but absent', () => {
  const { container } = renderWithStatus(UsbDriveStatus.absent)

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`No USB`)
})

test('shows eject if mounted', () => {
  const { container } = renderWithStatus(UsbDriveStatus.mounted)

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`Eject USB`)
})

test('shows ejected if recently ejected', () => {
  const { container } = renderWithStatus(UsbDriveStatus.recentlyEjected)

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`Ejected`)
})
