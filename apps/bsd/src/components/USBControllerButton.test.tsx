import React from 'react'

import USBControllerButton from './USBControllerButton'

import { UsbDriveStatus } from '../lib/usbstick'
import renderInAppContext from '../../test/renderInAppContext'

jest.mock('../lib/usbstick')

beforeAll(() => {
  jest.useFakeTimers()
})

afterAll(() => {
  jest.useRealTimers()
  delete window.kiosk
})

test('shows nothing if USB not available', () => {
  const { container } = renderInAppContext(<USBControllerButton />, {
    usbDriveStatus: UsbDriveStatus.notavailable,
  })

  expect(container.firstChild).toMatchInlineSnapshot(`null`)
})

test('shows No USB if usb available but absent', () => {
  const { container } = renderInAppContext(<USBControllerButton />, {
    usbDriveStatus: UsbDriveStatus.absent,
  })

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`No USB`)
})

test('shows eject if mounted', () => {
  const { container } = renderInAppContext(<USBControllerButton />, {
    usbDriveStatus: UsbDriveStatus.mounted,
  })

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`Eject USB`)
})

test('shows ejected if recently ejected', () => {
  const { container } = renderInAppContext(<USBControllerButton />, {
    usbDriveStatus: UsbDriveStatus.recentlyEjected,
  })

  expect(container.firstChild!.firstChild).toMatchInlineSnapshot(`Ejected`)
})
